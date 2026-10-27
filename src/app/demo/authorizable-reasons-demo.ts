import { Observable, of, throwError } from 'rxjs';
import { AuthorizableReason, AuthorizableReasons } from '../current-discounts/data/authorizable-reasons';

const refuse = (status: number, code: string, userMessage: string) => throwError(() => ({ status, code, userMessage }));
const sameReason = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;

/**
 * DEMO (A.2 row 7): the three reasons of the mockup in memory, until the API exists. A duplicate (ignoring case and accents) and an empty reason are refused,
 * the last reason cannot be removed, and a retried intention answers what it answered (one change per Idempotency-Key).
 */
export class DemoAuthorizableReasons extends AuthorizableReasons {
  private readonly answered = new Map<string, readonly AuthorizableReason[]>();
  constructor(private reasons: readonly string[] = ['Fidelización', 'Compensación por inconveniente', 'Convenio comercial']) { super(); }
  private view(): readonly AuthorizableReason[] { return this.reasons.map((reason) => ({ reason, removable: this.reasons.length > 1 })); }
  override list(): Observable<readonly AuthorizableReason[]> { return of(this.view()); }
  override add(reason: string, idempotencyKey: string): Observable<readonly AuthorizableReason[]> {
    const known = this.answered.get(idempotencyKey), typed = reason.trim();
    if (known) return of(known);
    if (!typed) return refuse(422, 'reason-required', 'Escribe el motivo que se podrá autorizar.');
    if (this.reasons.some((existing) => sameReason(existing, typed))) return refuse(409, 'reason-duplicated', 'Ese motivo ya está habilitado.');
    this.reasons = [...this.reasons, typed];
    return this.keep(idempotencyKey);
  }
  override remove(reason: string, idempotencyKey: string): Observable<readonly AuthorizableReason[]> {
    const known = this.answered.get(idempotencyKey);
    if (known) return of(known);
    if (this.reasons.length === 1) return refuse(409, 'reason-last', 'Debe quedar al menos un motivo habilitado.');
    this.reasons = this.reasons.filter((existing) => existing !== reason);
    return this.keep(idempotencyKey);
  }
  private keep(idempotencyKey: string): Observable<readonly AuthorizableReason[]> {
    const answer = this.view();
    this.answered.set(idempotencyKey, answer);
    return of(answer);
  }
}
