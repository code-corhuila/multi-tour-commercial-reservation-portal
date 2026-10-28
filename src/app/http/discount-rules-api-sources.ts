import { Observable, map, throwError } from 'rxjs';
import { DiscountRulesSource } from '../discounts/data/discount-rules-source';
import { DiscountRulesWriter } from '../discounts/data/discount-rules-writer';
import { DiscountRule, DiscountRuleCommand } from '../discounts/model/discount-rule';
import { ApiError, PortalApiClient } from '../shell-contract';
import { API_BASE, call } from './api-paths';

/** Discount rules over the container client (openapi: /discount-rules, PROPOSED field names; G-A). */
export const discountRulesPath = (id?: string, action?: 'inactivate'): string => [`${API_BASE}/discount-rules`, id, action].filter(Boolean).join('/');

/** DiscountRuleResponse of the contract; exactly one of the two values is present. */
interface DiscountRuleDto {
  readonly discountRuleId: string; readonly name: string; readonly validFrom: string; readonly validTo: string; readonly priority: number;
  readonly calculationBase: DiscountRule['calculationBase']; readonly percentageBasisPoints?: number; readonly amountCents?: number; readonly ruleStatus: DiscountRule['status'];
}

const notInContract = (what: string): Observable<never> => throwError((): ApiError => ({ status: 0, code: 'NOT_IN_CONTRACT', message: what, details: [], traceId: '', userMessage: what }));

function validityOf(status: DiscountRule['status'], startsOn: string, endsOn: string): DiscountRule['validity'] {
  const today = new Date().toISOString().slice(0, 10);
  return status === 'INACTIVE' ? { label: 'Inactivo', tone: 'pending', inForce: false } : today < startsOn ? { label: 'Próximo', tone: 'execution', inForce: false }
    : today > endsOn ? { label: 'Vencido', tone: 'finalized', inForce: false } : { label: 'Vigente', tone: 'confirmed', inForce: true };
}

/**
 * TODO(G-A, DD-1): the contract has no tour coverage, no accumulation and no cap. `name` carries the tour id until it does,
 * `stackable` reads false and `capCents` is absent. An amount rule has no portal model yet: it reads as 0 basis points.
 */
export function ruleFromDto(dto: DiscountRuleDto): DiscountRule {
  const startsOn = dto.validFrom.slice(0, 10), endsOn = dto.validTo.slice(0, 10);
  return { id: dto.discountRuleId, tourId: dto.name, tourName: dto.name, percentageBasisPoints: dto.percentageBasisPoints ?? 0, stackable: false, startsOn, endsOn,
    priority: dto.priority, calculationBase: dto.calculationBase, status: dto.ruleStatus, validity: validityOf(dto.ruleStatus, startsOn, endsOn) };
}

/** PROPOSED: the date-time of the contract is the start of the first day and the end of the last day (UTC). TODO(G-A): `stackable` and `capCents` are not sent. */
function bodyFromCommand(command: DiscountRuleCommand): Record<string, unknown> {
  return { name: command.tourId, validFrom: `${command.startsOn}T00:00:00Z`, validTo: `${command.endsOn}T23:59:59Z`, priority: command.priority,
    calculationBase: command.calculationBase, percentageBasisPoints: command.percentageBasisPoints };
}

export class DiscountRulesApiSource extends DiscountRulesSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  /** TODO(G-A): the contract publishes no list route (only get by id); the page shows its error state until it does. */
  override list(): Observable<readonly DiscountRule[]> { return notInContract('El servicio aún no publica el listado de descuentos.'); }
  get(id: string): Observable<DiscountRule> { return call<DiscountRuleDto>(this.client, discountRulesPath(id)).pipe(map(ruleFromDto)); }
}

export class DiscountRulesApiWriter extends DiscountRulesWriter {
  constructor(private readonly client: PortalApiClient) { super(); }
  override create(command: DiscountRuleCommand, idempotencyKey: string): Observable<DiscountRule> {
    return call<DiscountRuleDto>(this.client, discountRulesPath(), { method: 'POST', body: bodyFromCommand(command), headers: { 'Idempotency-Key': idempotencyKey } }).pipe(map(ruleFromDto));
  }
  /** The contract takes no key on PATCH and has no DELETE. */
  override update(id: string, command: DiscountRuleCommand, _idempotencyKey: string): Observable<DiscountRule> {
    return call<DiscountRuleDto>(this.client, discountRulesPath(id), { method: 'PATCH', body: bodyFromCommand(command) }).pipe(map(ruleFromDto));
  }
  override inactivate(id: string, _idempotencyKey: string): Observable<DiscountRule> {
    return call<DiscountRuleDto>(this.client, discountRulesPath(id, 'inactivate'), { method: 'POST' }).pipe(map(ruleFromDto));
  }
  /** Not in the contract (DP-07 open): "Reactivar" works only in the demo build. */
  override reactivate(_id: string, _idempotencyKey: string): Observable<DiscountRule> { return notInContract('El servicio aún no permite reactivar un descuento.'); }
}
