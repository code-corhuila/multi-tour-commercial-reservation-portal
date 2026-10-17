import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { RegisteringUser } from '../payments/data/payments-writer';
import { PAYMENT_PARAMETERS_COPY as T } from '../payment-parameters/payment-parameters-copy';
import { DepositSubject, ParameterAuditLine, ParameterRow, PaymentParametersSource, PaymentParametersView, PaymentParametersWriter, SaveParametersCommand } from '../payment-parameters/data/payment-parameters-ports';
import {
  EMPTY_CONFIG, EffectiveParameters, PARAMETER_FIELDS, ParameterOverrides, ParametersConfig, ReservationParametersLookup, SEED_LOOKUP, applyPatch, firstProblem,
  minimumDepositCents, parametersOf, tenantParameters,
} from '../payment-parameters/model/payment-parameters';
import { Clock } from '../reservation-changes/data/cancellation-ports';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { PortalCapabilities } from '../shared/portal-capabilities';
import type { DemoReservationsStore } from './reservations-demo';

// DEMO (spec 009- amendment v1.9, DP-PY7, G-B): the parameters, their audit and the snapshot each reservation keeps live in memory, one store per page.
const refuse = (status: number, userMessage: string) => throwError(() => ({ status, userMessage }));
const HISTORY_SIZE = 8;

export class DemoPaymentParametersStore extends PaymentParametersSource implements ReservationParametersLookup {
  config: ParametersConfig = EMPTY_CONFIG;
  audit: readonly ParameterAuditLine[] = [];
  lastChange: PaymentParametersView['lastChange'] = null;
  private readonly snapshots = new Map<string, EffectiveParameters>();

  /** The reservations that exist when the page starts keep the seed: a change applies to the new ones (AC-PY.17). */
  constructor(existing: readonly { readonly id: string; readonly tourName: string }[] = []) {
    super();
    existing.forEach((r) => this.snapshots.set(r.id, parametersOf(EMPTY_CONFIG, r.tourName)));
  }

  forReservation(reservation: { readonly id: string; readonly tourName: string }): EffectiveParameters {
    let kept = this.snapshots.get(reservation.id);
    if (!kept) { kept = parametersOf(this.config, reservation.tourName); this.snapshots.set(reservation.id, kept); }
    return kept;
  }

  view(services: readonly string[]): PaymentParametersView {
    const rows: ParameterRow[] = [{ scope: 'tenant', service: T.tenantRecord, own: this.config.tenant, applied: tenantParameters(this.config) },
      ...services.map((service): ParameterRow => ({ scope: 'service', service, own: this.config.services[service] ?? {}, applied: parametersOf(this.config, service) }))];
    return { rows, audit: this.audit.slice(0, HISTORY_SIZE), lastChange: this.lastChange };
  }

  override read(services: readonly string[]): Observable<PaymentParametersView> { return of(this.view(services)); }
  override minimumDepositCents(reservation: DepositSubject): Observable<number> {
    return of(minimumDepositCents(reservation.quote.finalCents, this.forReservation(reservation).minDepositPercent));
  }
}

const describe = (own: ParameterOverrides): string => {
  const parts = PARAMETER_FIELDS.filter((f) => own[f.key] !== undefined).map((f) => `${T.fields[f.key].short}: ${own[f.key]}`);
  return parts.length ? parts.join(' · ') : T.inherits;
};
const same = (a: ParameterOverrides, b: ParameterOverrides) => PARAMETER_FIELDS.every((f) => a[f.key] === b[f.key]);

/** AC-PY.17: the capability first (403), then the reason, the bounds and a real change; each changed record leaves one audit line; the key answers the same view. */
export class DemoPaymentParametersWriter extends PaymentParametersWriter {
  constructor(private readonly store: DemoPaymentParametersStore, private readonly capabilities: PortalCapabilities, private readonly user: RegisteringUser,
    private readonly clock: Clock, private readonly answered = new Map<string, PaymentParametersView>()) { super(); }

  override save(command: SaveParametersCommand, key: string): Observable<PaymentParametersView> {
    const known = this.answered.get(key), services = Object.keys(command.services);
    if (known) return of(known);
    if (!this.capabilities.canManagePaymentParameters()) return refuse(403, T.forbidden);
    const reason = command.reason.trim();
    if (!reason) return refuse(409, T.reasonRequired);
    const problem = firstProblem(T.tenantRecord, command.tenant) ?? services.map((s) => firstProblem(s, command.services[s])).find((p) => p !== null) ?? null;
    if (problem) { const f = PARAMETER_FIELDS.find((x) => x.key === problem.key)!; return refuse(409, T.outOfBounds(problem.record, T.fields[f.key].label, f.min, f.max)); }
    const before = this.store.config, tenant = applyPatch(before.tenant, command.tenant), next: Record<string, ParameterOverrides> = { ...before.services };
    services.forEach((s) => { const own = applyPatch(before.services[s], command.services[s]); if (Object.keys(own).length) next[s] = own; else delete next[s]; });
    const records = [...new Set([...Object.keys(before.services), ...Object.keys(next)])];
    const changes = [{ record: T.tenantRecord, previous: before.tenant, next: tenant }, ...records.map((s) => ({ record: s, previous: before.services[s] ?? {}, next: next[s] ?? {} }))]
      .filter((c) => !same(c.previous, c.next));
    if (!changes.length) return refuse(409, T.noChanges);
    const at = this.clock.now(), actor = this.user.label();
    this.store.config = { tenant, services: next };
    this.store.lastChange = { at, actor };
    this.store.audit = [...changes.map((c): ParameterAuditLine => ({ at, actor, record: c.record, reason, previous: describe(c.previous), next: describe(c.next) })), ...this.store.audit];
    const view = this.store.view(records);
    this.answered.set(key, view);
    return of(view);
  }
}

/** The lookup the other demos read: the store of the page, or the seed when the build supplies none. */
export const lookupOf = (source: PaymentParametersSource | null): ReservationParametersLookup => (source as DemoPaymentParametersStore | null) ?? SEED_LOOKUP;

/** Registered in sources.demo.ts; the answered keys belong to the page. */
export function paymentParametersDemoProviders(): Provider[] {
  const answered = new Map<string, PaymentParametersView>();
  let store: DemoPaymentParametersStore | undefined;
  return [
    { provide: PaymentParametersSource, deps: [ReservationsSource], useFactory: (s: ReservationsSource) => (store ??= new DemoPaymentParametersStore((s as DemoReservationsStore).items)) },
    { provide: PaymentParametersWriter, deps: [PaymentParametersSource, PortalCapabilities, RegisteringUser, Clock],
      useFactory: (p: DemoPaymentParametersStore, k: PortalCapabilities, u: RegisteringUser, c: Clock) => new DemoPaymentParametersWriter(p, k, u, c, answered) },
  ];
}
