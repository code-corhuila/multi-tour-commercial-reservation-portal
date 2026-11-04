/**
 * The payment parameters of the tenant (HU-COM-009 amendment v1.9, section A.3; RN-RES-004, RF-021). Names in English (pillar 11);
 * PROPUESTO until the contract (gap G-B). The parameters are hours and percentages: whole numbers within their bounds.
 */
export const PARAMETER_FIELDS = [
  { key: 'initialHoursTotal', min: 1, max: 720 },
  { key: 'initialHoursDeposit', min: 1, max: 720 },
  { key: 'minDepositPercent', min: 1, max: 100 },
  { key: 'extensionHours', min: 1, max: 720 },
  { key: 'balanceHoursBefore', min: 1, max: 720 },
  { key: 'cancellationPenaltyPercent', min: 0, max: 100 },
] as const;

export type ParameterKey = (typeof PARAMETER_FIELDS)[number]['key'];
/** What applies to one reservation. The penalty is null while the policy is NO DEFINIDO (013- DP-CN1): nothing is retained or refunded yet. */
export type EffectiveParameters = Readonly<Record<Exclude<ParameterKey, 'cancellationPenaltyPercent'>, number>> & { readonly cancellationPenaltyPercent: number | null };
/** The values one row of the grid defines itself; a missing key inherits the tenant value (a service) or the seed (the tenant). */
export type ParameterOverrides = Readonly<Partial<Record<ParameterKey, number>>>;
/** What the Administrator typed: a number sets the value, null clears it back to the inherited one. Cells the person did not touch are not in it. */
export type ParameterPatch = Readonly<Partial<Record<ParameterKey, number | null>>>;
export type ParametersConfig = { readonly tenant: ParameterOverrides; readonly services: Readonly<Record<string, ParameterOverrides>> };

/**
 * DP-PY9: the real values are NO DEFINIDO. The demo keeps the figures the earlier stories already ran with: the 72-hour wait of 011- (DP-PP1),
 * its 24-hour extension, the minimum partial of one third of the final value (010- DP-PV1, not a whole percentage) and no penalty policy (013- DP-CN1).
 */
export const SEED_PARAMETERS: EffectiveParameters = Object.freeze({
  initialHoursTotal: 72, initialHoursDeposit: 72, minDepositPercent: 100 / 3, extensionHours: 24, balanceHoursBefore: 24, cancellationPenaltyPercent: null,
});

export const EMPTY_CONFIG: ParametersConfig = Object.freeze({ tenant: {}, services: {} });

const merge = (base: EffectiveParameters, overrides: ParameterOverrides | undefined): EffectiveParameters => ({ ...base, ...overrides });

export const tenantParameters = (config: ParametersConfig): EffectiveParameters => merge(SEED_PARAMETERS, config.tenant);
export const parametersOf = (config: ParametersConfig, service: string): EffectiveParameters => merge(tenantParameters(config), config.services[service]);

/** The minimum deposit over the final value after discounts, in cents; rounded up to the next cent and immune to floating point noise (a third of $300.000 is $100.000). */
export function minimumDepositCents(finalCents: number, percent: number): number {
  return Math.ceil(Number(((finalCents * percent) / 100).toFixed(6)));
}

/** The initial wait, in hours, of the payment type (RN-RES-006); anything not a partial payment is a total one. */
export const initialHoursOf = (p: EffectiveParameters, paymentType: string | undefined): number => (paymentType === 'PARTIAL' ? p.initialHoursDeposit : p.initialHoursTotal);

/** Which parameters each reservation was created with, and the demo or the service behind it (AC-PY.17: a change applies to new reservations only). */
export interface ReservationParametersLookup {
  forReservation(reservation: { readonly id: string; readonly tourName: string }): EffectiveParameters;
}
/** The seed for everybody: what a demo double uses when the build supplies no store of parameters. */
export const SEED_LOOKUP: ReservationParametersLookup = Object.freeze({ forReservation: () => SEED_PARAMETERS });

export type ParameterProblem = { readonly record: string; readonly key: ParameterKey };

/** A patch is valid when every number is a whole number inside its bounds; the first offender, or null. */
export function firstProblem(record: string, patch: ParameterPatch): ParameterProblem | null {
  for (const field of PARAMETER_FIELDS) {
    const value = patch[field.key];
    if (value !== undefined && value !== null && (!Number.isInteger(value) || value < field.min || value > field.max)) return { record, key: field.key };
  }
  return null;
}

/** Applies a patch to the overrides of a row: a number sets, null clears. */
export function applyPatch(own: ParameterOverrides | undefined, patch: ParameterPatch | undefined): ParameterOverrides {
  const next: Partial<Record<ParameterKey, number>> = { ...own };
  for (const field of PARAMETER_FIELDS) {
    const value = patch?.[field.key];
    if (value === null) delete next[field.key];
    else if (value !== undefined) next[field.key] = value;
  }
  return next;
}
