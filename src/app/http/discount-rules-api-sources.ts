import { Observable, map, switchMap } from 'rxjs';
import { CatalogItem } from '../catalog/model/catalog-item';
import { DiscountRulesSource } from '../discounts/data/discount-rules-source';
import { DiscountRulesWriter } from '../discounts/data/discount-rules-writer';
import { DiscountRule, DiscountRuleCommand } from '../discounts/model/discount-rule';
import { PortalApiClient } from '../shell-contract';
import { API_BASE, call, catalogPath, listAll } from './api-paths';

/** Discount rules over the container client (openapi: /discount-rules, PROPOSED field names). */
export const discountRulesPath = (id?: string, action?: 'inactivate' | 'reactivate'): string => [`${API_BASE}/discount-rules`, id, action].filter(Boolean).join('/');

/** DiscountRuleResponse of the contract; exactly one of the two values is present. */
interface DiscountRuleDto {
  readonly discountRuleId: string; readonly name: string; readonly validFrom: string; readonly validTo: string; readonly priority: number;
  readonly calculationBase: DiscountRule['calculationBase']; readonly percentageBasisPoints?: number; readonly amountCents?: number;
  readonly serviceCoverage: 'ALL' | 'SELECTED'; readonly serviceIds?: readonly string[]; readonly capCents?: number; readonly stackable?: boolean; readonly ruleStatus: DiscountRule['status'];
}

function validityOf(status: DiscountRule['status'], startsOn: string, endsOn: string): DiscountRule['validity'] {
  const today = new Date().toISOString().slice(0, 10);
  return status === 'INACTIVE' ? { label: 'Inactivo', tone: 'pending', inForce: false } : today < startsOn ? { label: 'Próximo', tone: 'execution', inForce: false }
    : today > endsOn ? { label: 'Vencido', tone: 'finalized', inForce: false } : { label: 'Vigente', tone: 'confirmed', inForce: true };
}

/**
 * The portal rule covers one tour: it reads the first of `serviceIds` when the coverage is SELECTED.
 * TODO(DD-3): a rule that covers ALL services or several has no portal model; it reads with an empty `tourId` (no UI is invented).
 * `stackable` is the flag of the service (DP-04, decision 2026-11-03); a rule without it reads true. An amount rule reads as 0 basis points.
 * `tourName` is the rule name, which the portal sends as the commercial name of the chosen tour.
 */
export function ruleFromDto(dto: DiscountRuleDto): DiscountRule {
  const startsOn = dto.validFrom, endsOn = dto.validTo;
  return { id: dto.discountRuleId, tourId: dto.serviceCoverage === 'SELECTED' ? dto.serviceIds?.[0] ?? '' : '', tourName: dto.name,
    percentageBasisPoints: dto.percentageBasisPoints ?? 0, capCents: dto.capCents, stackable: dto.stackable ?? true, startsOn, endsOn,
    priority: dto.priority, calculationBase: dto.calculationBase, status: dto.ruleStatus, validity: validityOf(dto.ruleStatus, startsOn, endsOn) };
}

/**
 * Plain dates (YYYY-MM-DD) as the contract says. The rule `name` is the commercial name of the chosen tour (decision 2026-11-03).
 * `capCents` is sent as null on an update so a rule edited without a cap loses it; a creation omits it.
 */
function bodyFromCommand(command: DiscountRuleCommand, name: string, update = false): Record<string, unknown> {
  return { name, validFrom: command.startsOn, validTo: command.endsOn, priority: command.priority,
    calculationBase: command.calculationBase, percentageBasisPoints: command.percentageBasisPoints, stackable: command.stackable,
    serviceCoverage: 'SELECTED', serviceIds: [command.tourId], ...(command.capCents ? { capCents: command.capCents } : update ? { capCents: null } : {}) };
}

export class DiscountRulesApiSource extends DiscountRulesSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  override list(): Observable<readonly DiscountRule[]> { return listAll<DiscountRuleDto>(this.client, discountRulesPath()).pipe(map((rules) => rules.map(ruleFromDto))); }
  get(id: string): Observable<DiscountRule> { return call<DiscountRuleDto>(this.client, discountRulesPath(id)).pipe(map(ruleFromDto)); }
}

export class DiscountRulesApiWriter extends DiscountRulesWriter {
  constructor(private readonly client: PortalApiClient) { super(); }
  /** The commercial name of the tour of the rule; nothing is written when it cannot be read. */
  private tourName(tourId: string): Observable<string> { return call<CatalogItem>(this.client, catalogPath(tourId)).pipe(map((tour) => tour.commercialName)); }
  override create(command: DiscountRuleCommand, idempotencyKey: string): Observable<DiscountRule> {
    return this.tourName(command.tourId).pipe(switchMap((name) => call<DiscountRuleDto>(this.client, discountRulesPath(),
      { method: 'POST', body: bodyFromCommand(command, name), headers: { 'Idempotency-Key': idempotencyKey } })), map(ruleFromDto));
  }
  /** PATCH is idempotent by nature, so it carries no key (contract updateDiscountRule). */
  override update(id: string, command: DiscountRuleCommand, _idempotencyKey: string): Observable<DiscountRule> {
    return this.tourName(command.tourId).pipe(switchMap((name) => call<DiscountRuleDto>(this.client, discountRulesPath(id),
      { method: 'PATCH', body: bodyFromCommand(command, name, true) })), map(ruleFromDto));
  }
  override inactivate(id: string, _idempotencyKey: string): Observable<DiscountRule> {
    return call<DiscountRuleDto>(this.client, discountRulesPath(id, 'inactivate'), { method: 'POST' }).pipe(map(ruleFromDto));
  }
  override reactivate(id: string, _idempotencyKey: string): Observable<DiscountRule> {
    return call<DiscountRuleDto>(this.client, discountRulesPath(id, 'reactivate'), { method: 'POST' }).pipe(map(ruleFromDto));
  }
}
