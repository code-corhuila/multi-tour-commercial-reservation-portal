import { Observable, map, switchMap, throwError } from 'rxjs';
import { AdditionalDiscountContext, AdditionalDiscountContexts, AdditionalDiscountPreview } from '../current-discounts/data/additional-discount-contexts';
import { AdditionalDiscountApplied, AdditionalDiscountCommand, AdditionalDiscountWriter } from '../current-discounts/data/additional-discount-writer';
import { AuthorizableReason, AuthorizableReasons } from '../current-discounts/data/authorizable-reasons';
import { ApiError, PortalApiClient } from '../shell-contract';
import { API_BASE, call, listAll, notInContract } from './api-paths';

/** Additional discount over the container client (openapi: /reservations/{id}/additional-discount and /additional-discount-reasons, PROPOSED; G-API). */
export const additionalDiscountPath = (reservationId: string, action?: 'preview'): string => [`${API_BASE}/reservations`, reservationId, 'additional-discount', action].filter(Boolean).join('/');
export const reasonsPath = (reasonId?: string, action?: 'disable'): string => [`${API_BASE}/additional-discount-reasons`, reasonId, action].filter(Boolean).join('/');

/** DiscountBreakdown of the contract; the additional line, when there is one, is the last. */
interface BreakdownDto {
  readonly baseCents: number; readonly finalValueCents: number;
  readonly lines: readonly { readonly kind: 'RULE' | 'ADDITIONAL'; readonly baseCents: number; readonly amountCents: number }[];
}
interface PreviewDto { readonly newFinalValueCents: number; readonly excessCents: number }
interface ReasonDto { readonly reasonId: string; readonly text: string; readonly reasonStatus: 'ENABLED' | 'DISABLED' }

export class AdditionalDiscountApiContexts extends AdditionalDiscountContexts {
  constructor(private readonly client: PortalApiClient) { super(); }
  /** TODO(G-B): the contract has no read of a reservation (customer, service, paid, state); the screen shows its error state until HU-COM-007 publishes it. */
  override of(_reservationId: string): Observable<AdditionalDiscountContext | null> { return notInContract('El servicio aún no publica la consulta de la reserva.'); }
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
      map((dto): AdditionalDiscountApplied => {
        const line = dto.lines[dto.lines.length - 1];
        /** TODO(G-API): the answer carries no author, no date and no excess; they read empty and zero (the preview already showed the excess). */
        return { ...command, appliedBy: '', appliedAt: '', previousValueCents: line.baseCents, amountCents: line.amountCents, newValueCents: dto.finalValueCents, excessCents: 0 };
      }),
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
