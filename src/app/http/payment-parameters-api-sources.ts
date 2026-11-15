import { Observable, concat, forkJoin, map, switchMap, toArray } from 'rxjs';
import { CatalogItem } from '../catalog/model/catalog-item';
import { DepositSubject, ParameterRow, PaymentParametersSource, PaymentParametersView, PaymentParametersWriter, SaveParametersCommand } from '../payment-parameters/data/payment-parameters-ports';
import { ParameterKey, ParameterOverrides, ParameterPatch, ParametersConfig, SEED_PARAMETERS, parametersOf, tenantParameters } from '../payment-parameters/model/payment-parameters';
import { PortalApiClient } from '../shell-contract';
import { call, cancellationPoliciesPath, catalogPath, listAll, notInContract, reservationsPath } from './api-paths';
import { paymentParametersPath } from './payments-api-sources';

type WireType = 'FULL_PAYMENT' | 'DEPOSIT';
/** PaymentParameter of the contract (PROPOSED): one row per payment type and, optionally, per service; hours 1 to 720, the minimum in basis points. */
interface RowDto {
  readonly paymentType: WireType; readonly serviceId?: string; readonly initialWaitHours: number; readonly additionalWaitHours: number; readonly minimumDepositBp?: number;
  readonly balanceDeadlineAdvanceHours?: number; readonly transferEnabled: boolean; readonly cashEnabled: boolean; readonly changedBy?: string; readonly changedAt?: string;
}
type Values = Omit<RowDto, 'changedBy' | 'changedAt'>;
/** CancellationPolicy of the contract (PROPOSED, HU-COM-013 DP-02): the penalty of a customer cancellation per service, or of the whole tenant when serviceId is absent, in basis points. */
interface PolicyDto { readonly serviceId?: string; readonly penaltyBasisPoints: number; readonly changedBy?: string; readonly changedAt?: string }

/** The fields of the screen that each type of the contract holds (the extension is one value on the screen and one per type on the wire). */
const FIELDS_OF: Record<WireType, readonly ParameterKey[]> = {
  FULL_PAYMENT: ['initialHoursTotal', 'extensionHours'],
  DEPOSIT: ['initialHoursDeposit', 'minDepositPercent', 'extensionHours', 'balanceHoursBefore'],
};

/** What the rows of one scope define: DEPOSIT wins the extension, as it is the only type that holds all of the others. */
function overridesOf(rows: readonly RowDto[], policy?: PolicyDto): ParameterOverrides {
  const full = rows.find((r) => r.paymentType === 'FULL_PAYMENT'), deposit = rows.find((r) => r.paymentType === 'DEPOSIT');
  const own: Partial<Record<ParameterKey, number>> = {};
  if (full) { own.initialHoursTotal = full.initialWaitHours; own.extensionHours = full.additionalWaitHours; }
  if (deposit) {
    own.initialHoursDeposit = deposit.initialWaitHours; own.extensionHours = deposit.additionalWaitHours;
    if (deposit.minimumDepositBp !== undefined) { own.minDepositPercent = deposit.minimumDepositBp / 100; }
    if (deposit.balanceDeadlineAdvanceHours !== undefined) { own.balanceHoursBefore = deposit.balanceDeadlineAdvanceHours; }
  }
  if (policy) { own.cancellationPenaltyPercent = policy.penaltyBasisPoints / 100; }
  return own;
}

/**
 * The parameters over GET /payment-parameters and the penalty over GET /cancellation-policies (HU-COM-013 DP-02). The audit list is not served (DP-04: the last change only),
 * so the audit stays empty. The author of the last change is the identifier the service returns, not a name.
 */
export class PaymentParametersApiSource extends PaymentParametersSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  override read(services: readonly string[]): Observable<PaymentParametersView> {
    return forkJoin({ rows: listAll<RowDto>(this.client, paymentParametersPath()), tours: listAll<CatalogItem>(this.client, catalogPath()),
      policies: listAll<PolicyDto>(this.client, cancellationPoliciesPath()) }).pipe(map(({ rows, tours, policies }) => {
      const config: ParametersConfig = {
        tenant: overridesOf(rows.filter((r) => !r.serviceId), policies.find((q) => !q.serviceId)),
        services: Object.fromEntries(services.map((name) => [name, overridesOf(rows.filter((r) => r.serviceId && r.serviceId === tours.find((t) => t.commercialName === name)?.serviceId),
          policies.find((q) => q.serviceId && q.serviceId === tours.find((t) => t.commercialName === name)?.serviceId))])),
      };
      const view: ParameterRow[] = [{ scope: 'tenant', service: '', own: config.tenant, applied: tenantParameters(config) },
        ...services.map((name): ParameterRow => ({ scope: 'service', service: name, own: config.services[name], applied: parametersOf(config, name) }))];
      const last = [...rows, ...policies].filter((r) => r.changedAt).sort((a, b) => b.changedAt!.localeCompare(a.changedAt!))[0];
      return { rows: view, audit: [], lastChange: last ? { at: last.changedAt!, actor: last.changedBy ?? '' } : null };
    }));
  }
  /** AC-PY.12: the minimum is calculated by the service on the final value after discounts; the portal calculates nothing. */
  override minimumDepositCents(reservation: DepositSubject): Observable<number> {
    return call<{ minimumDepositCents: number }>(this.client, `${reservationsPath(reservation.id)}/payment-quote?type=DEPOSIT`).pipe(map((quote) => quote.minimumDepositCents));
  }
}

/**
 * PUT /payment-parameters under the Idempotency-Key, with the whole rows of the types the change touches. Only the types the change touches are sent. A penalty goes to PUT /cancellation-policies
 * under the same key, plus ':penalty' when the same change also writes parameters (HU-COM-013 DP-02); each write is sent only when the change touches it. A row that does not exist yet starts
 * from the tenant row of that type, else from the model's defaults (OPEN: its transfer and cash flags). The contract has no way to clear a value
 * back to the inherited one (null), so that builds no call.
 */
export class PaymentParametersApiWriter extends PaymentParametersWriter {
  private readonly reader: PaymentParametersApiSource;
  constructor(private readonly client: PortalApiClient) { super(); this.reader = new PaymentParametersApiSource(client); }
  override save(command: SaveParametersCommand, idempotencyKey: string): Observable<PaymentParametersView> {
    const scopes: [string | undefined, ParameterPatch][] = [[undefined, command.tenant], ...Object.entries(command.services)];
    if (scopes.some(([, patch]) => Object.values(patch).some((value) => value === null))) {
      return notInContract('El servicio no permite volver al valor heredado.');
    }
    return forkJoin({ rows: listAll<RowDto>(this.client, paymentParametersPath()), tours: listAll<CatalogItem>(this.client, catalogPath()) }).pipe(
      switchMap(({ rows, tours }) => {
        const parameters = scopes.flatMap(([name, patch]) => {
          const serviceId = name === undefined ? undefined : tours.find((t) => t.commercialName === name)?.serviceId;
          return (['FULL_PAYMENT', 'DEPOSIT'] as const).filter((type) => FIELDS_OF[type].some((key) => patch[key] !== undefined))
            .map((type) => rowFor(type, serviceId, rows, patch));
        });
        const policies = scopes.flatMap(([name, patch]) => {
          const percent = patch.cancellationPenaltyPercent as number | undefined;
          const serviceId = name === undefined ? undefined : tours.find((t) => t.commercialName === name)?.serviceId;
          return percent === undefined ? [] : [{ ...(serviceId ? { serviceId } : {}), penaltyBasisPoints: Math.round(percent * 100) }];
        });
        const writes = [
          ...(parameters.length ? [call(this.client, paymentParametersPath(), { method: 'PUT', body: { reason: command.reason, parameters }, headers: { 'Idempotency-Key': idempotencyKey } })] : []),
          ...(policies.length ? [call(this.client, cancellationPoliciesPath(), { method: 'PUT', body: { reason: command.reason, policies }, headers: { 'Idempotency-Key': parameters.length ? `${idempotencyKey}:penalty` : idempotencyKey } })] : []),
        ];
        return concat(...writes).pipe(toArray());
      }),
      switchMap(() => this.reader.read(Object.keys(command.services))),
    );
  }
}

/** The whole row of a type in a scope after the patch; the keys of the patch are numbers here (a null was refused before). */
function rowFor(type: WireType, serviceId: string | undefined, rows: readonly RowDto[], patch: ParameterPatch): Values {
  const base = rows.find((r) => r.paymentType === type && r.serviceId === serviceId) ?? rows.find((r) => r.paymentType === type && !r.serviceId);
  const n = (key: ParameterKey) => patch[key] as number | undefined;
  const deposit = type === 'DEPOSIT';
  const minimum = n('minDepositPercent');
  return {
    paymentType: type, ...(serviceId ? { serviceId } : {}),
    initialWaitHours: (deposit ? n('initialHoursDeposit') : n('initialHoursTotal')) ?? base?.initialWaitHours ?? (deposit ? SEED_PARAMETERS.initialHoursDeposit : SEED_PARAMETERS.initialHoursTotal),
    additionalWaitHours: n('extensionHours') ?? base?.additionalWaitHours ?? SEED_PARAMETERS.extensionHours,
    ...(deposit ? {
      minimumDepositBp: minimum !== undefined ? Math.round(minimum * 100) : base?.minimumDepositBp ?? Math.round(SEED_PARAMETERS.minDepositPercent * 100),
      balanceDeadlineAdvanceHours: n('balanceHoursBefore') ?? base?.balanceDeadlineAdvanceHours ?? SEED_PARAMETERS.balanceHoursBefore,
    } : {}),
    transferEnabled: base?.transferEnabled ?? true, cashEnabled: base?.cashEnabled ?? true,
  };
}
