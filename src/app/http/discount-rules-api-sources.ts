import { Observable, map, throwError } from 'rxjs';
import { DiscountRulesSource } from '../discounts/data/discount-rules-source';
import { DiscountRulesWriter } from '../discounts/data/discount-rules-writer';
import { DiscountRule, DiscountRuleCommand } from '../discounts/model/discount-rule';
import { ApiError, PortalApiClient } from '../shell-contract';
import { API_BASE, call, listAll } from './api-paths';

/** Discount rules over the container client (openapi: /discount-rules, PROPOSED field names). */
export const discountRulesPath = (id?: string, action?: 'inactivate'): string => [`${API_BASE}/discount-rules`, id, action].filter(Boolean).join('/');

/** DiscountRuleResponse of the contract; exactly one of the two values is present. */
interface DiscountRuleDto {
  readonly discountRuleId: string; readonly name: string; readonly validFrom: string; readonly validTo: string; readonly priority: number;
  readonly calculationBase: DiscountRule['calculationBase']; readonly percentageBasisPoints?: number; readonly amountCents?: number;
  readonly serviceCoverage: 'ALL' | 'SELECTED'; readonly serviceIds?: readonly string[]; readonly capCents?: number; readonly ruleStatus: DiscountRule['status'];
}

const notInContract = (what: string): Observable<never> => throwError((): ApiError => ({ status: 0, code: 'NOT_IN_CONTRACT', message: what, details: [], traceId: '', userMessage: what }));

function validityOf(status: DiscountRule['status'], startsOn: string, endsOn: string): DiscountRule['validity'] {
  const today = new Date().toISOString().slice(0, 10);
  return status === 'INACTIVE' ? { label: 'Inactivo', tone: 'pending', inForce: false } : today < startsOn ? { label: 'Próximo', tone: 'execution', inForce: false }
    : today > endsOn ? { label: 'Vencido', tone: 'finalized', inForce: false } : { label: 'Vigente', tone: 'confirmed', inForce: true };
}

/**
 * The portal rule covers one tour: it reads the first of `serviceIds` when the coverage is SELECTED.
 * TODO(DD-3): a rule that covers ALL services or several has no portal model; it reads with an empty `tourId` (no UI is invented).
 * `stackable` reads false: accumulation (DP-04) is out of the closing scope. An amount rule reads as 0 basis points.
 * `tourName` is the rule name until the page resolves the catalog name.
 */
export function ruleFromDto(dto: DiscountRuleDto): DiscountRule {
  const startsOn = dto.validFrom, endsOn = dto.validTo;
  return { id: dto.discountRuleId, tourId: dto.serviceCoverage === 'SELECTED' ? dto.serviceIds?.[0] ?? '' : '', tourName: dto.name,
    percentageBasisPoints: dto.percentageBasisPoints ?? 0, capCents: dto.capCents, stackable: false, startsOn, endsOn,
    priority: dto.priority, calculationBase: dto.calculationBase, status: dto.ruleStatus, validity: validityOf(dto.ruleStatus, startsOn, endsOn) };
}

/**
 * Plain dates (YYYY-MM-DD) as the contract says. TODO(DD-3): the command carries no rule name, so the name is derived from the tour
 * id until the page passes the catalog name; `stackable` is not sent (no field in the contract).
 */
function bodyFromCommand(command: DiscountRuleCommand): Record<string, unknown> {
  return { name: `Descuento ${command.tourId}`, validFrom: command.startsOn, validTo: command.endsOn, priority: command.priority,
    calculationBase: command.calculationBase, percentageBasisPoints: command.percentageBasisPoints,
    serviceCoverage: 'SELECTED', serviceIds: [command.tourId], ...(command.capCents ? { capCents: command.capCents } : {}) };
}

export class DiscountRulesApiSource extends DiscountRulesSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  override list(): Observable<readonly DiscountRule[]> { return listAll<DiscountRuleDto>(this.client, discountRulesPath()).pipe(map((rules) => rules.map(ruleFromDto))); }
  get(id: string): Observable<DiscountRule> { return call<DiscountRuleDto>(this.client, discountRulesPath(id)).pipe(map(ruleFromDto)); }
}

export class DiscountRulesApiWriter extends DiscountRulesWriter {
  constructor(private readonly client: PortalApiClient) { super(); }
  override create(command: DiscountRuleCommand, idempotencyKey: string): Observable<DiscountRule> {
    return call<DiscountRuleDto>(this.client, discountRulesPath(), { method: 'POST', body: bodyFromCommand(command), headers: { 'Idempotency-Key': idempotencyKey } }).pipe(map(ruleFromDto));
  }
  /** Not published (closing decision 2026-10-28): there is no PATCH route and no DELETE; "Editar" works only in the demo build. */
  override update(_id: string, _command: DiscountRuleCommand, _idempotencyKey: string): Observable<DiscountRule> { return notInContract('El servicio aún no permite editar un descuento.'); }
  override inactivate(id: string, _idempotencyKey: string): Observable<DiscountRule> {
    return call<DiscountRuleDto>(this.client, discountRulesPath(id, 'inactivate'), { method: 'POST' }).pipe(map(ruleFromDto));
  }
  /** Not in the contract (DP-07 open): "Reactivar" works only in the demo build. */
  override reactivate(_id: string, _idempotencyKey: string): Observable<DiscountRule> { return notInContract('El servicio aún no permite reactivar un descuento.'); }
}
