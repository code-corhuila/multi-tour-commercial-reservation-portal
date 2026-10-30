import { Observable, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AdditionalDiscountContext, AdditionalDiscountContexts, AdditionalDiscountPreview } from '../current-discounts/data/additional-discount-contexts';
import { AdditionalDiscountApplied, AdditionalDiscountCommand, AdditionalDiscountWriter } from '../current-discounts/data/additional-discount-writer';
import { AuthorizableReason, AuthorizableReasons } from '../current-discounts/data/authorizable-reasons';
import { ApiError, PortalApiClient } from '../shell-contract';
import { STATUS_LABEL } from '../reservations/model/reservation';
import { API_BASE, call, listAll, reservationsPath } from './api-paths';
import { ReservationDto, reservationFrom, rowsOf } from './reservations-api-sources';

/** Additional discount over the container client (openapi: /reservations/{id}/additional-discount and /additional-discount-reasons, PROPOSED; G-API). */
export const additionalDiscountPath = (reservationId: string, action?: 'preview'): string => [`${API_BASE}/reservations`, reservationId, 'additional-discount', action].filter(Boolean).join('/');
/** GET /reservations/{id}/discount-breakdown (PROPOSED): the current breakdown, the only read that shows the additional discount. */
export const discountBreakdownPath = (reservationId: string): string => `${API_BASE}/reservations/${reservationId}/discount-breakdown`;
export const reasonsPath = (reasonId?: string, action?: 'disable'): string => [`${API_BASE}/additional-discount-reasons`, reasonId, action].filter(Boolean).join('/');

/** DiscountBreakdown of the contract; the additional line, when there is one, is the last. */
interface BreakdownDto {
  readonly baseCents: number; readonly finalValueCents: number;
  readonly lines: readonly { readonly kind: 'RULE' | 'ADDITIONAL'; readonly baseCents: number; readonly amountCents: number }[];
}
/** ReservationDiscountBreakdown of the contract: the other fields are present only when the reservation has an additional discount. */
interface CurrentBreakdownDto {
  readonly breakdown?: BreakdownDto; readonly excessCents?: number; readonly additionalDiscount?: { readonly authorId: string; readonly registeredAt: string };
}
interface PreviewDto { readonly newFinalValueCents: number; readonly excessCents: number }
interface ReasonDto { readonly reasonId: string; readonly text: string; readonly reasonStatus: 'ENABLED' | 'DISABLED' }

const NO_CAP_BASIS_POINTS = 10_000;
const ELIGIBLE: readonly string[] = ['PENDIENTE_DE_PAGO', 'CONFIRMADA'];

const currentBreakdown = (client: PortalApiClient, reservationId: string): Observable<CurrentBreakdownDto> =>
  call<CurrentBreakdownDto>(client, discountBreakdownPath(reservationId));

/** The percentage is read back from the additional line (its amount over its base), in basis points; the author is the account, the name is OPEN. */
function appliedFrom(current: CurrentBreakdownDto): AdditionalDiscountContext['applied'] {
  const line = current.breakdown?.lines.find((l) => l.kind === 'ADDITIONAL');
  if (!current.additionalDiscount || !line) return undefined;
  return { basisPoints: Math.round((line.amountCents * 10_000) / line.baseCents), appliedAt: current.additionalDiscount.registeredAt, appliedBy: current.additionalDiscount.authorId };
}

export class AdditionalDiscountApiContexts extends AdditionalDiscountContexts {
  constructor(private readonly client: PortalApiClient) { super(); }
  /**
   * GET /reservations/{id} for the values fixed at creation and the list row for the two names the detail lacks. Only Pendiente de pago and
   * Confirmada are eligible, and only once: the current breakdown tells whether an additional discount exists and who registered it. The
   * contract publishes no cap (no cap exists, 2026-10-28), so the screen is given the ceiling of the field itself (10 000 basis points).
   */
  override of(reservationId: string): Observable<AdditionalDiscountContext | null> {
    return call<ReservationDto>(this.client, reservationsPath(reservationId)).pipe(
      switchMap((dto) => forkJoin({ rows: rowsOf(this.client), current: currentBreakdown(this.client, reservationId) }).pipe(
        map(({ rows, current }) => ({ r: reservationFrom(dto, rows.find((row) => row.reservationId === reservationId)), applied: appliedFrom(current) })))),
      map(({ r, applied }): AdditionalDiscountContext => ({
        reservationId: r.id, customerName: r.leadCustomerName, serviceName: r.tourName, currentValueCents: r.quote.finalCents, generalDiscountCents: r.quote.discountCents,
        paidCents: r.validatedCents ?? 0, capBasisPoints: NO_CAP_BASIS_POINTS, eligible: ELIGIBLE.includes(r.status) && !applied, stateLabel: STATUS_LABEL[r.status],
        ...(applied ? { applied } : {}),
      })),
      catchError((error: Partial<ApiError>) => (error.status === 404 ? of(null) : throwError(() => error))),
    );
  }
  override preview(reservationId: string, basisPoints: number): Observable<AdditionalDiscountPreview> {
    return call<PreviewDto>(this.client, `${additionalDiscountPath(reservationId, 'preview')}?basisPoints=${basisPoints}`)
      .pipe(map((dto) => ({ newValueCents: dto.newFinalValueCents, excessCents: dto.excessCents })));
  }
}

/** The contract takes the id of an enabled reason; the screen holds its text, so the writer reads the list to find the id. */
const enabledReasons = (client: PortalApiClient): Observable<readonly ReasonDto[]> =>
  listAll<ReasonDto>(client, reasonsPath()).pipe(map((all) => all.filter((r) => r.reasonStatus === 'ENABLED')));
const sameText = (a: string, b: string): boolean => a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;
const notEnabled = (): Observable<never> => throwError((): ApiError => ({ status: 422, code: 'BUSINESS_RULE_VIOLATION', message: 'The reason is not enabled.', details: [], traceId: '', userMessage: 'Ese motivo no está habilitado.' }));

export class AdditionalDiscountApiWriter extends AdditionalDiscountWriter {
  constructor(private readonly client: PortalApiClient) { super(); }
  override register(command: AdditionalDiscountCommand, idempotencyKey: string): Observable<AdditionalDiscountApplied> {
    return enabledReasons(this.client).pipe(
      map((reasons) => reasons.find((r) => sameText(r.text, command.reason))),
      switchMap((found) => !found ? notEnabled() : call<BreakdownDto>(this.client, additionalDiscountPath(command.reservationId),
        { method: 'POST', body: { basisPoints: command.percentageBasisPoints, reasonId: found.reasonId }, headers: { 'Idempotency-Key': idempotencyKey } })),
      switchMap((dto) => currentBreakdown(this.client, command.reservationId).pipe(
        /** The answer of the registration carries no author, no date and no excess: the current breakdown does. If that read fails the registration still stands, so they read empty and zero. */
        catchError(() => of<CurrentBreakdownDto | null>(null)),
        map((current): AdditionalDiscountApplied => {
          const line = dto.lines[dto.lines.length - 1];
          return { ...command, appliedBy: current?.additionalDiscount?.authorId ?? '', appliedAt: current?.additionalDiscount?.registeredAt ?? '', previousValueCents: line.baseCents,
            amountCents: line.amountCents, newValueCents: dto.finalValueCents, excessCents: current?.excessCents ?? 0 };
        }),
      )),
    );
  }
}

export class AuthorizableReasonsApi extends AuthorizableReasons {
  constructor(private readonly client: PortalApiClient) { super(); }
  /** `removable` is false for the last enabled reason; the service refuses its disabling anyway. */
  private list$(): Observable<readonly AuthorizableReason[]> {
    return enabledReasons(this.client).pipe(map((reasons) => reasons.map((r) => ({ reason: r.text, removable: reasons.length > 1 }))));
  }
  override list(): Observable<readonly AuthorizableReason[]> { return this.list$(); }
  override add(reason: string, idempotencyKey: string): Observable<readonly AuthorizableReason[]> {
    return call<ReasonDto>(this.client, reasonsPath(), { method: 'POST', body: { text: reason }, headers: { 'Idempotency-Key': idempotencyKey } }).pipe(switchMap(() => this.list$()));
  }
  /** The contract takes no key on the disabling. */
  override remove(reason: string, _idempotencyKey: string): Observable<readonly AuthorizableReason[]> {
    return enabledReasons(this.client).pipe(
      map((reasons) => reasons.find((r) => r.text === reason)),
      switchMap((found) => !found ? notEnabled() : call<ReasonDto>(this.client, reasonsPath(found.reasonId, 'disable'), { method: 'POST' })),
      switchMap(() => this.list$()),
    );
  }
}
