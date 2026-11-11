import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { DemoDeparturesStore, DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { RESCHEDULING_SEEDS } from '../src/app/demo/rescheduling-seeds';
import { DemoExternalAnswerWriter, DemoReschedulingDeadlines, DemoReschedulingSource, DemoReschedulingWriter } from '../src/app/demo/rescheduling-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { API_BASE } from '../src/app/http/api-paths';
import { ExternalAnswerApiWriter } from '../src/app/http/rescheduling-api-writers';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ExternalAnswerCommand, ExternalAnswerWriter, RESCHEDULING_AREA, ReschedulingEpisodeView, ReschedulingSource, ReschedulingWriter } from '../src/app/rescheduling/data/rescheduling-ports';
import { ReschedulingPageComponent } from '../src/app/rescheduling/pages/rescheduling-page.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { ActorRole, PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { fakeClient, page } from './api-client.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-018 (T-09, AC-RP.6, AC-RP.13): the answer a customer gave by an outside channel, recorded with its channel and evidence; the history shows the channel, never the evidence (AC-18.19).
const NOW = '2026-10-13T09:30:00-05:00';
const clock = new FixedClock(NOW);
const demo = (at = clock) => {
  const store = new DemoReservationsStore(RESCHEDULING_SEEDS.map((r) => ({ ...r }))), source = new DemoReschedulingSource(store, new DemoDeparturesStore(), new DemoReschedulingDeadlines(at));
  return { store, source, writer: new DemoExternalAnswerWriter(source, at, 'Colaborador operativo'), proposer: new DemoReschedulingWriter(source, at, 'Colaborador operativo') };
};
const command = (over: Partial<ExternalAnswerCommand> = {}): ExternalAnswerCommand => ({ code: 'RES-1829', decision: 'ACCEPTED', channel: 'EMAIL', evidence: 'Correo del cliente del 13 oct', answeredAt: '2026-10-13T08:00:00-05:00', idempotencyKey: 'key-0001-aaaa', ...over });
const find = (store: DemoReservationsStore, id: string) => store.items.find((r) => r.id === id)!;

describe('externalAnswerNeedsChannelEvidenceAndAValidTime', () => {
  it('refuses a missing channel, a missing or too long evidence and an invalid or future time, and changes nothing', async () => {
    const { writer, store } = demo();
    const refusal = async (over: Partial<ExternalAnswerCommand>) => (await firstValueFrom(writer.record(command(over)))) as { kind: string; reason?: string };
    expect(await refusal({ channel: '' })).toMatchObject({ kind: 'refused', reason: 'no-channel' });
    expect(await refusal({ evidence: '   ' })).toMatchObject({ kind: 'refused', reason: 'no-evidence' });
    expect(await refusal({ evidence: 'x'.repeat(501) })).toMatchObject({ kind: 'refused', reason: 'no-evidence' });
    expect(await refusal({ answeredAt: 'not a time' })).toMatchObject({ kind: 'refused', reason: 'bad-time' });
    expect(await refusal({ answeredAt: '2026-10-14T08:00:00-05:00' })).toMatchObject({ kind: 'refused', reason: 'bad-time' });
    expect(find(store, 'RES-1829').reschedulingEpisode?.answer).toBeUndefined();
  });
});

describe('externalAnswerAfterTheResponseDeadlineIsRefused', () => {
  it('refuses an answer dated after the deadline the port resolved', async () => {
    const late = new FixedClock('2026-10-20T09:30:00-05:00'), { writer, store } = demo(late);
    const outcome = await firstValueFrom(writer.record(command({ answeredAt: '2026-10-17T08:00:00-05:00' })));
    expect(outcome).toEqual({ kind: 'refused', reason: 'after-deadline' });
    expect(find(store, 'RES-1829').reschedulingEpisode?.answer).toBeUndefined();
  });
});

describe('externalAcceptKeepsTheSameReservationAndExternalRejectCancelsWithAFullRefund', () => {
  it('moves the same reservation to the proposed departure on accept', async () => {
    const { writer, store } = demo();
    expect((await firstValueFrom(writer.record(command()))).kind).toBe('done');
    expect(find(store, 'RES-1829')).toMatchObject({ id: 'RES-1829', status: 'CONFIRMADA', departureId: 'demo-dep-8', reschedulingPending: false });
  });

  it('cancels with the 100 % of the validated values on reject, and a retry with the same key records nothing more', async () => {
    const { writer, store } = demo();
    await firstValueFrom(writer.record(command({ decision: 'REJECTED', channel: 'PHONE' })));
    await firstValueFrom(writer.record(command({ decision: 'REJECTED', channel: 'PHONE' })));
    expect(find(store, 'RES-1829')).toMatchObject({ status: 'CANCELADA', financialDecision: { origin: 'HU-COM-018', refundableCents: 30_000_000 } });
  });

  it('records the actor, the channel and the time, and the history names the channel and never the evidence', async () => {
    const { writer, source } = demo();
    await firstValueFrom(writer.record(command({ channel: 'WHATSAPP' })));
    const view = (await firstValueFrom(source.episode('RES-1829')))!;
    const entry = view.history!.find((h) => h.action.startsWith('Respuesta registrada'))!;
    expect(entry).toMatchObject({ actor: 'Colaborador operativo', action: 'Respuesta registrada: acepta', detail: 'Canal: WhatsApp' });
    expect(JSON.stringify(view.history)).not.toContain('Correo del cliente');
    expect(view.history!.map((h) => h.action)).toEqual(['Episodio abierto', 'Propuesta enviada', 'Respuesta registrada: acepta']);
  });
});

describe('httpExternalAnswerOverTheService', () => {
  const open = { reschedulingId: 'e-1', reservationId: 'r-1', state: 'OPEN', proposals: [{ proposalId: 'p-1', state: 'PENDING' }] };
  const source = { episode: () => of({ reservationId: 'r-1' } as unknown as ReschedulingEpisodeView) } as unknown as ReschedulingSource;

  it('posts the decision, channel, evidence and time of the contract with the key', async () => {
    const { client, calls } = fakeClient({ ok: page([open]) }, { ok: open });
    const outcome = await firstValueFrom(new ExternalAnswerApiWriter(client, source).record(command({ code: 'r-1', decision: 'REJECTED', channel: 'IN_PERSON', answeredAt: '2026-11-11T10:00:00Z' })));
    expect(calls[1]).toMatchObject({ path: `${API_BASE}/reschedulings/e-1/proposals/p-1/external-answer`, method: 'POST', headers: { 'Idempotency-Key': 'key-0001-aaaa' },
      body: { decision: 'REJECT', channel: 'IN_PERSON', evidence: 'Correo del cliente del 13 oct', answeredAt: '2026-11-11T10:00:00.000Z' } });
    expect(outcome.kind).toBe('done');
  });

  it('refuses as closed without calling the service when there is no pending proposal', async () => {
    const { client, calls } = fakeClient({ ok: page([{ ...open, proposals: [] }]) });
    expect(await firstValueFrom(new ExternalAnswerApiWriter(client, source).record(command({ code: 'r-1' })))).toEqual({ kind: 'refused', reason: 'closed' });
    expect(calls).toHaveLength(1);
  });
});

async function screen(role: ActorRole, code = 'RES-1829') {
  TestBed.resetTestingModule();
  const d = demo(), navigation = new PortalNavigation();
  navigation.register(['reservations', RESCHEDULING_AREA]);
  navigation.params.set({ reservation: code });
  TestBed.configureTestingModule({ providers: [
    { provide: ActorContext, useValue: actorAs(role) }, { provide: ReschedulingSource, useValue: d.source }, { provide: ReschedulingWriter, useValue: d.proposer },
    { provide: ExternalAnswerWriter, useValue: d.writer }, { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }, { provide: PortalNavigation, useValue: navigation },
  ] as Provider[] });
  const fixture = TestBed.createComponent(ReschedulingPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const flat = () => (host.textContent ?? '').replace(/\s+/g, ' ');
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const set = async (selector: string, value: string) => { const el = host.querySelector<HTMLInputElement>(selector)!; el.value = value; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input')); await settle(); };
  return { ...d, host, settle, flat, button, set };
}

describe('externalAnswerFormOfTheOperatorScreen', () => {
  it('draws the panel of the mockup for the Collaborator with a pending proposal, and the history with its four columns', async () => {
    const s = await screen('OPERATIONAL_COLLABORATOR');
    expect(s.flat()).toContain('Registrar la respuesta del cliente');
    expect(Array.from(s.host.querySelectorAll('#crp-rp-channel option')).map((o) => o.textContent?.trim())).toEqual(['Selecciona el canal', 'Correo electrónico', 'Teléfono', 'WhatsApp', 'Presencial']);
    expect(s.flat()).toContain('Historial del episodio');
    expect(Array.from(s.host.querySelectorAll('[data-history] th')).map((h) => h.textContent?.trim())).toEqual(['Fecha y hora', 'Responsable', 'Acción', 'Detalle']);
  });

  it('records the answer, shows the mockup message and the channel in the history', async () => {
    const s = await screen('TENANT_ADMINISTRATOR');
    await s.set('#crp-rp-channel', 'EMAIL'); await s.set('#crp-rp-responded-at', '2026-10-13T08:00'); await s.set('#crp-rp-evidence', 'Correo del cliente del 13 oct');
    s.button('Registrar respuesta')!.click(); await s.settle();
    expect(s.flat()).toContain('Respuesta registrada: el cliente acepta.');
    expect(s.flat()).toContain('Canal: Correo electrónico');
    expect(s.flat()).not.toContain('Correo del cliente del 13 oct');
  });

  it('reports a missing evidence in the mockup words and records nothing', async () => {
    const s = await screen('TENANT_ADMINISTRATOR');
    await s.set('#crp-rp-channel', 'EMAIL'); await s.set('#crp-rp-responded-at', '2026-10-13T08:00');
    s.button('Registrar respuesta')!.click(); await s.settle();
    expect(s.flat()).toContain('Registra la evidencia de la respuesta del cliente (referencia, nombre del archivo o descripción).');
    expect(find(s.store, 'RES-1829').reschedulingEpisode?.answer).toBeUndefined();
  });

  it('shows the history and no form to a role that only reads, and no form when the episode has no pending proposal', async () => {
    const s = await screen('ANALYST');
    expect(s.flat()).toContain('Historial del episodio');
    expect(s.flat()).not.toContain('Registrar la respuesta del cliente');
    expect(PortalCapabilities.for('ANALYST').canRecordReschedulingAnswer()).toBe(false);
    expect(PortalCapabilities.for('OPERATIONAL_COLLABORATOR').canRecordReschedulingAnswer()).toBe(true);
    const none = await screen('TENANT_ADMINISTRATOR', 'RES-1828');
    expect(none.flat()).not.toContain('Registrar la respuesta del cliente');
  });
});
