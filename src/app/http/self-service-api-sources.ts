import { Observable, catchError, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { CustomerCompanion } from '../shared/customer-companions';
import { STATUS_CODE } from '../reservations/data/reservations-source';
import { Reservation } from '../reservations/model/reservation';
import { MyReservationsSource } from '../self-service-reservation/data/my-reservations-source';
import { CheckoutHolder, ReservationRequester, SelectionQuoteSource } from '../self-service-reservation/data/reservation-confirmation-ports';
import { CustomerReservation, ReservationSelection, SelectionQuote } from '../self-service-reservation/model/self-service-reservation';
import { ApiError, PortalApiClient } from '../shell-contract';
import { call, ownReservationQuotesPath, publicOfferPath, reservationsPath } from './api-paths';
import { METHOD_OUT, TYPE_OUT, ReservationDto, reservationFrom, rowsOf } from './reservations-api-sources';
import { ReservationQuoteDto } from './reservation-quote-api-source';

/** The reservation as the customer's panel reads it: the codes of the customer area, the values the service fixed, no recalculation. */
function customerReservationFrom(r: Reservation, serviceId: string): CustomerReservation {
  return {
    reservationId: r.id, tourName: r.tourName, departureAt: r.departureDate, departureId: r.departureId ?? '', serviceIds: [serviceId], people: r.people,
    projectedValueCents: r.quote.projectedCents, finalValueCents: r.quote.finalCents, reservationStatus: STATUS_CODE[r.status], paymentStatus: r.financialStatus,
    ...(r.paymentMethod ? { paymentMethod: r.paymentMethod } : {}),
  };
}

/**
 * The customer's own reservations over the routes of HU-COM-007 (api spec 008 DP-06): the service filters by the token, so the portal sends
 * no customer and no tenant. DEBT: one read per row. TODO: the state of the last proof (HU-COM-010) is not in the row, so it stays absent.
 */
export class MyReservationsApiSource extends MyReservationsSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  override listMine(): Observable<readonly CustomerReservation[]> {
    return rowsOf(this.client).pipe(switchMap((rows) => (rows.length
      ? forkJoin(rows.map((row) => call<ReservationDto>(this.client, reservationsPath(row.reservationId)).pipe(map((dto) => customerReservationFrom(reservationFrom(dto, row), dto.serviceId)))))
      : of([] as CustomerReservation[]))));
  }
}

/** PublicTourDetail of the contract (PROPOSED): the one read of a tour that a Final Customer is allowed (the catalog is the operator's). */
interface PublicTourDetailDto { readonly commercialName: string; readonly departures: readonly { readonly departureId: string; readonly startsAt: string }[] }
interface DiscountLineDto { readonly order: number; readonly name: string; readonly calculationBase: 'ORIGINAL_VALUE' | 'PREVIOUS_SUBTOTAL'; readonly amountCents: number; readonly subtotalCents: number }

const noTenant = (): Observable<never> => throwError((): ApiError => ({
  status: 0, code: 'NO_TENANT_IDENTIFIER', message: 'The channel has no tenant identifier.', details: [], traceId: '', userMessage: 'No se pudo identificar el canal del operador.',
}));
const departureGone = (): Observable<never> => throwError((): ApiError => ({
  status: 404, code: 'NOT_FOUND', message: 'The departure is no longer offered.', details: [], traceId: '', userMessage: 'Esta salida ya no está disponible.',
}));

/**
 * The summary of a selection: POST /own/reservation-quotes (the selection only) and the public detail of the tour for its name and the start of the
 * departure. The Final Customer has their own quote route (HU-COM-008 DP-12); the staff route answers them 403.
 */
export class SelectionQuoteApiSource extends SelectionQuoteSource {
  constructor(private readonly client: PortalApiClient, private readonly identifier: () => string | null) { super(); }
  override quote(selection: ReservationSelection): Observable<SelectionQuote> {
    const tenant = this.identifier(), serviceId = selection.serviceIds[0];
    if (!tenant) { return noTenant(); }
    return forkJoin({
      quote: call<Omit<ReservationQuoteDto, 'discounts'> & { readonly discounts: readonly DiscountLineDto[] }>(this.client, ownReservationQuotesPath(), { method: 'POST', body: { serviceId, salidaId: selection.departureId, people: selection.people } }),
      tour: call<PublicTourDetailDto>(this.client, publicOfferPath(tenant, 'tours', serviceId)),
    }).pipe(switchMap(({ quote, tour }) => {
      const departure = tour.departures.find((d) => d.departureId === selection.departureId);
      return departure ? of<SelectionQuote>({
        tourName: tour.commercialName, departureAt: departure.startsAt, baseValueCents: quote.projectedValueCents,
        discountCents: quote.discounts.reduce((sum, d) => sum + d.amountCents, 0), finalValueCents: quote.finalValueCents,
        discountLines: quote.discounts.map((d) => ({ order: d.order, name: d.name, base: d.calculationBase, amountCents: d.amountCents, subtotalCents: d.subtotalCents })),
      }) : departureGone();
    }));
  }
}

/**
 * POST /reservations with the Idempotency-Key of the intention. For a Final Customer the body is the selection, the payment type and the method chosen on 21 (both required, DP-08 option C);
 * the customer is the one of the token (AC-08.9), so no customer id travels. The holder (AC-08.13, DP-RS5) travels inline; the portal cannot know whether the
 * account already has a customer record, so a 400 naming `holder` (it has one) repeats the creation once without it, under the same key: a refusal stores nothing.
 */
export class ReservationRequesterApi extends ReservationRequester {
  constructor(private readonly client: PortalApiClient) { super(); }
  override request(selection: ReservationSelection, paymentMethod: string, idempotencyKey: string, companions: readonly CustomerCompanion[] = [], paymentType = '', holder?: CheckoutHolder): Observable<CustomerReservation> {
    // Only the three fields the contract has; the phone and the emergency contact stay on the screen (gap G-B, HU-COM-005 D-6).
    const body = { serviceId: selection.serviceIds[0], salidaId: selection.departureId, people: selection.people, ...(paymentType ? { paymentType: TYPE_OUT[paymentType] ?? paymentType } : {}), ...(paymentMethod ? { paymentMethod: METHOD_OUT[paymentMethod] ?? paymentMethod } : {}),
      ...(companions.length ? { companions: companions.map((c) => ({ fullName: c.fullName, documentNumber: c.document, birthDate: c.birthDate })) } : {}) };
    const create = (sent: object) => call<ReservationDto>(this.client, reservationsPath(), { method: 'POST', body: sent, headers: { 'Idempotency-Key': idempotencyKey } });
    const wire = holder ? { fullName: holder.fullName, documentNumber: holder.document, birthDate: holder.birthDate, contact: { email: holder.email, phone: holder.phone }, termsAccepted: holder.termsAccepted } : null;
    const created = !wire ? create(body) : create({ ...body, holder: wire }).pipe(
      catchError((error: Partial<ApiError>) => (error.status === 400 && error.details?.some((d) => d.field === 'holder') ? create(body) : throwError(() => error))),
    );
    return created.pipe(
      switchMap((dto) => rowsOf(this.client).pipe(map((rows) => customerReservationFrom(reservationFrom(dto, rows.find((row) => row.reservationId === dto.reservationId)), dto.serviceId)))),
    );
  }
}
