import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { ReservationsWriter } from '../reservations/data/reservations-writer';
import { CreateReservationCommand, Reservation } from '../reservations/model/reservation';
import { PortalApiClient } from '../shell-contract';
import { call, listAll, notInContract, reservationsPath } from './api-paths';
import { ReservationQuoteDto, quoteFrom } from './reservation-quote-api-source';

type Status = Reservation['status'];
type Financial = Reservation['financialStatus'];

/** DP-08 (PROPOSED): the wire speaks English; the screens keep their own codes, so each side is mapped here and nowhere else. */
const STATUS: Record<string, Status> = { PENDING_PAYMENT: 'PENDIENTE_DE_PAGO', CONFIRMED: 'CONFIRMADA', IN_EXECUTION: 'EN_EJECUCION', COMPLETED: 'FINALIZADA', CANCELLED: 'CANCELADA' };
/** BALANCE_PENDING (the deposit is validated and the rest is still due) reads as the deposit received: the portal model has no sixth situation. */
const FINANCIAL: Record<string, Financial> = { NO_PAYMENT: 'SIN_PAGO', PARTIAL: 'PARCIAL', DEPOSIT_RECEIVED: 'ABONO_RECIBIDO', BALANCE_PENDING: 'ABONO_RECIBIDO', FULLY_PAID: 'PAGO_COMPLETO' };
const TYPE_IN: Record<string, string> = { FULL_PAYMENT: 'TOTAL', DEPOSIT: 'PARTIAL' };
const METHOD_IN: Record<string, string> = { TRANSFER: 'BANK_TRANSFER', CASH: 'CASH_AT_OFFICE' };
const invert = (codes: Record<string, string>) => Object.fromEntries(Object.entries(codes).map(([wire, own]) => [own, wire]));
const TYPE_OUT = invert(TYPE_IN), METHOD_OUT = invert(METHOD_IN);

/** ReservationSummary of the contract (PROPOSED): the row of screen 10, which carries the names the detail lacks. */
interface SummaryDto { readonly reservationId: string; readonly customerName: string; readonly tourName: string; readonly departureStartsAt: string }
/** ReservationResponse of the contract (PROPOSED): the values and the context fixed at creation, never recalculated (RN-RES-003). */
interface ReservationDto extends ReservationQuoteDto {
  readonly reservationId: string; readonly salidaId: string; readonly people: number; readonly reservationStatus: string; readonly paymentStatus: string;
  readonly paymentType?: string; readonly paymentMethod?: string; readonly pendingBalanceCents: number; readonly validatedValueCents?: number;
  readonly paymentDeadline?: string; readonly seatHeld: boolean; readonly conditions?: string | null;
}

/** The reservation the screens read: the response of the service and, for the names it does not carry, the row of the list. */
export function reservationFrom(dto: ReservationDto, row?: SummaryDto): Reservation {
  const tourName = row?.tourName ?? '';
  return {
    id: dto.reservationId, leadCustomerName: row?.customerName ?? '', tourName, departureDate: row?.departureStartsAt ?? '', conditions: dto.conditions ?? '', people: dto.people,
    quote: quoteFrom(dto, tourName), balanceCents: dto.pendingBalanceCents, status: STATUS[dto.reservationStatus] ?? 'PENDIENTE_DE_PAGO',
    financialStatus: FINANCIAL[dto.paymentStatus] ?? 'SIN_PAGO', seatHeld: dto.seatHeld, departureId: dto.salidaId,
    ...(dto.paymentType ? { paymentType: TYPE_IN[dto.paymentType] ?? dto.paymentType } : {}),
    ...(dto.paymentMethod ? { paymentMethod: METHOD_IN[dto.paymentMethod] ?? dto.paymentMethod } : {}),
    ...(dto.validatedValueCents !== undefined ? { validatedCents: dto.validatedValueCents } : {}),
    ...(dto.paymentDeadline ? { deadline: { dueAt: dto.paymentDeadline } } : {}),
  };
}

const rowsOf = (client: PortalApiClient) => listAll<SummaryDto>(client, reservationsPath(), { scope: 'all' });

/**
 * The reservations over GET /reservations and GET /reservations/{id}. The page hides the archived ones, so every scope is asked.
 * DEBT: one read per row (the row has no values and the detail has no names); a service-side list with both would remove it.
 */
export class ReservationsApiSource extends ReservationsSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  override list(): Observable<readonly Reservation[]> {
    return rowsOf(this.client).pipe(switchMap((rows) => (rows.length
      ? forkJoin(rows.map((row) => call<ReservationDto>(this.client, reservationsPath(row.reservationId)).pipe(map((dto) => reservationFrom(dto, row)))))
      : of([] as Reservation[]))));
  }
}

/**
 * POST /reservations with the Idempotency-Key of the intention. The body is the selection and nothing else: the service recalculates and
 * fixes the value, takes the tenant from the token and the user from the session. TODO(G-B): the operator names the customer by id, so a
 * titular typed by hand (HU-COM-005 amendment) has no route yet, and the contract has no field for the risk data of a high-risk tour.
 */
export class ReservationsApiWriter extends ReservationsWriter {
  constructor(private readonly client: PortalApiClient) { super(); }
  override create(command: CreateReservationCommand, idempotencyKey: string): Observable<Reservation> {
    if (!command.leadCustomerId) { return notInContract('El servicio aún no publica el registro del titular junto con la reserva: elija un cliente registrado.'); }
    const companions = (command.companions ?? []).map((c) => ({ fullName: c.fullName, documentNumber: c.document, ...(c.birthDate ? { birthDate: c.birthDate } : {}) }));
    const body = {
      customerId: command.leadCustomerId, serviceId: command.serviceIds[0], salidaId: command.departureId, people: command.people,
      ...(command.paymentType ? { paymentType: TYPE_OUT[command.paymentType] ?? command.paymentType } : {}),
      ...(command.paymentMethod ? { paymentMethod: METHOD_OUT[command.paymentMethod] ?? command.paymentMethod } : {}),
      ...(companions.length ? { companions } : {}),
    };
    return call<ReservationDto>(this.client, reservationsPath(), { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }).pipe(
      switchMap((dto) => rowsOf(this.client).pipe(map((rows) => reservationFrom(dto, rows.find((row) => row.reservationId === dto.reservationId))))),
    );
  }
}
