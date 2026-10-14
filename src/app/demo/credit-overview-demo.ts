import { CREDIT_BALANCE_COPY as T } from '../credit-balance/credit-balance-copy';
import { CreditApplyOutcome, CreditBalance, CreditCustomer, CreditMovement, CreditOverview } from '../credit-balance/data/credit-balance-ports';
import { Reservation, STATUS_LABEL } from '../reservations/model/reservation';
import { formatCop as money } from '../shared/format';
import { minimumPartial, situation } from './proof-review-demo';
import { resolveRefund } from './refunds-demo';
import type { DemoDeparturesStore, DemoReservationsStore } from './reservations-demo';

// DEMO (spec 017- amendment, DD-1, G-B): the credit book is a view over the lines of the one reservations store (plan D-02, D-08); DP-CB8: customers are grouped by name.
/** One use of a credit line: how much of the source reservation credit paid the target, who did it and when (AC-CB.6). */
export type CreditApplication = { readonly id: string; readonly sourceId: string; readonly targetId: string; readonly amountCents: number; readonly actor: string; readonly at: string; readonly tenant: string };
/** Section 8: the demo runs one tenant; the container session carries the real one. */
export const DEMO_TENANT = 'tenant-demo';
const HOUR = 3_600_000, sum = (items: readonly { amountCents: number }[]) => items.reduce((total, i) => total + i.amountCents, 0);
const normalize = (name: string) => name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** The mockup: these states admit no new payment. */
const CLOSED: ReadonlySet<Reservation['status']> = new Set(['CANCELADA', 'FINALIZADA', 'EN_EJECUCION']);
const colombian = (ms: number) => `${new Date(ms - 5 * HOUR).toISOString().slice(0, 19)}-05:00`;
const startOf = (date: string) => Date.parse(date.includes('T') ? `${date}-05:00` : `${date}T00:00:00-05:00`);

/** The lines of the store, plus the 100 % that HU-COM-016 kept as a credit balance on its own treatment page (conflict declared: it writes the decision on the refund, not a line). */
function linesOf(store: DemoReservationsStore, now: number): readonly CreditBalance[] {
  return [...store.creditBalances, ...store.items.flatMap((r): CreditBalance[] => {
    const kept = r.refund?.creditBalance;
    if (!kept || store.creditBalances.some((l) => l.reservationId === r.id && l.origin === 'TRATAMIENTO')) return [];
    return [{ id: `SAF-${r.id}`, reservationId: r.id, tenant: DEMO_TENANT, amountCents: resolveRefund(r, r.refund!, now).amountCents, origin: 'TRATAMIENTO', status: 'PENDIENTE', recordedBy: kept.by, recordedAt: kept.at, appliedTo: null }];
  })];
}

/** The summary, the customers (credit by origin reservation, net of what was applied and set aside) and the requests, as the mockup draws them. */
export function overviewOf(store: DemoReservationsStore, now: number): CreditOverview {
  const all = linesOf(store, now), nameOf = (id: string) => store.items.find((r) => r.id === id)?.leadCustomerName ?? T.unknownCustomer, live = store.creditRequests.filter((q) => q.state !== 'RECHAZADA');
  const grouped = new Map<string, { name: string; sources: CreditCustomer['sources'][number][]; history: CreditMovement[] }>();
  for (const id of new Set(all.map((l) => l.reservationId))) {
    const lines = all.filter((l) => l.reservationId === id), used = store.creditApplications.filter((a) => a.sourceId === id), key = normalize(nameOf(id));
    const customer = grouped.get(key) ?? { name: nameOf(id), sources: [], history: [] }, balance = sum(lines) - sum(used), requested = sum(live.filter((q) => q.reservationId === id));
    customer.sources.push({ reservationId: id, balanceCents: balance, requestedCents: requested, availableCents: Math.max(balance - requested, 0) });
    customer.history.push(...lines.map((l): CreditMovement => ({ at: l.recordedAt, kind: 'ORIGEN', detail: T.origin[l.origin], reservationId: id, amountCents: l.amountCents, actor: l.recordedBy })),
      ...used.map((a): CreditMovement => ({ at: a.at, kind: 'APLICACION', detail: T.appliedTo(a.targetId), reservationId: id, amountCents: -a.amountCents, actor: a.actor })),
      ...store.creditRequests.filter((q) => q.reservationId === id).map((q): CreditMovement => ({ at: q.requestedAt, kind: 'DEVOLUCION', detail: `Solicitud ${T.state[q.state]}`, reservationId: id, amountCents: -q.amountCents, actor: q.requestedBy })));
    grouped.set(key, customer);
  }
  const customers = [...grouped].map(([key, c]): CreditCustomer => {
    const availableCents = c.sources.reduce((total, s) => total + s.availableCents, 0);
    const targets = store.items.filter((r) => normalize(r.leadCustomerName) === key && !CLOSED.has(r.status) && r.balanceCents > 0).map((r) => ({ reservationId: r.id, balanceCents: r.balanceCents }));
    return { key, name: c.name, availableCents, sources: c.sources, targets, suggestedCents: Math.min(availableCents, targets[0]?.balanceCents ?? 0),
      history: [...c.history].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) };
  }).sort((a, b) => b.availableCents - a.availableCents);
  return { availableCents: customers.reduce((total, c) => total + c.availableCents, 0), customersWithBalance: customers.filter((c) => c.availableCents > 0).length,
    pendingDecisions: live.filter((q) => q.state === 'PENDIENTE_DE_AUTORIZACION').length, customers, requests: [...store.creditRequests] };
}

/** AC-CB.4, D-5: the refusals of the mockup in its order; a first payment holds the seat in the same operation or applies nothing (G10). */
export function applyCredit(store: DemoReservationsStore, departures: DemoDeparturesStore, now: string, tenant: string, actor: string, targetId: string, cents: number): CreditApplyOutcome {
  const target = store.items.find((r) => r.id === targetId), refuse = (reason: string): CreditApplyOutcome => ({ ok: false, reason });
  if (!target) return refuse(T.refusal.notFound);
  if (CLOSED.has(target.status)) return refuse(T.refusal.state(STATUS_LABEL[target.status]));
  const departure = departures.items.find((d) => d.id === target.departureId);
  if ((departure && departure.state !== 'PROGRAMADA') || startOf(target.departureDate) <= Date.parse(now)) return refuse(T.refusal.started);
  if (!(target.balanceCents > 0)) return refuse(T.refusal.noPending);
  const credit = overviewOf(store, Date.parse(now)).customers.find((c) => c.key === normalize(target.leadCustomerName)), available = credit?.availableCents ?? 0;
  if (!(cents > 0)) return refuse(T.refusal.zero);
  if (cents > available) return refuse(T.refusal.aboveAvailable(money(available)));
  if (cents > target.balanceCents) return refuse(T.refusal.abovePending(money(target.balanceCents)));
  const firstPayment = !target.seatHeld, held = store.items.filter((r) => r.id !== target.id && r.seatHeld && r.departureId === target.departureId).reduce((n, r) => n + r.people, 0);
  const free = Math.max((departure?.effectiveCapacity ?? Infinity) - held, 0);
  if (firstPayment && departure && free < target.people) return refuse(T.refusal.noSeats(free));
  let remaining = cents;
  for (const source of credit!.sources.filter((s) => s.availableCents > 0)) {
    const used = Math.min(source.availableCents, remaining);
    remaining -= used;
    if (used > 0) store.creditApplications = [...store.creditApplications, { id: `SAA-${store.creditApplications.length + 1}`, sourceId: source.reservationId, targetId, amountCents: used, actor, at: now, tenant }];
  }
  const validatedCents = (target.validatedCents ?? 0) + cents, balanceCents = target.balanceCents - cents;
  const reached = target.paymentType === 'PARTIAL' ? validatedCents >= minimumPartial(target) : balanceCents === 0;
  const status = target.status === 'PENDIENTE_DE_PAGO' && reached ? 'CONFIRMADA' : target.status;
  store.items = store.items.map((r) => (r.id === targetId ? { ...r, status, validatedCents, balanceCents, seatHeld: true, financialStatus: situation({ ...r, status }, validatedCents, balanceCents) } : r));
  return { ok: true, appliedCents: cents, firstPayment };
}
