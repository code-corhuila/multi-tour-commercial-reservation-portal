import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { ReservationsApiSource, ReservationsApiWriter } from '../src/app/http/reservations-api-sources';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { ReservationsWriter } from '../src/app/reservations/data/reservations-writer';
import { CreateReservationCommand } from '../src/app/reservations/model/reservation';
import { sourceProviders } from '../src/app/sources';
import { fakeClient, page } from './api-client.double';

const detail = {
  reservationId: 'r-1', customerId: 'c-1', serviceId: 't-1', salidaId: 'd-1', people: 3,
  tourLine: { ratePerPersonCents: 1999, people: 3, amountCents: 5997 }, transportLine: { ratePerPersonCents: 500, people: 3, amountCents: 1500 }, projectedValueCents: 7497,
  discounts: [{ order: 1, name: 'Temporada baja', calculationBase: 'ORIGINAL_VALUE', baseCents: 7497, amountCents: 750, subtotalCents: 6747 }], finalValueCents: 6747,
  reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'NO_PAYMENT', paymentType: 'FULL_PAYMENT', paymentMethod: 'TRANSFER', pendingBalanceCents: 6747,
  seatHeld: false, conditions: null, createdAt: '2026-10-30T10:00:00Z',
};
const summary = { reservationId: 'r-1', customerName: 'Laura Gómez (demo)', tourName: 'Desierto de la Tatacoa', departureStartsAt: '2026-11-07T06:30:00Z',
  reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'NO_PAYMENT', pendingBalanceCents: 6747 };
const reservation = {
  id: 'r-1', leadCustomerName: 'Laura Gómez (demo)', tourName: 'Desierto de la Tatacoa', departureDate: '2026-11-07T06:30:00Z', conditions: '', people: 3,
  quote: { services: [{ name: 'Desierto de la Tatacoa', cents: 5997 }], transportCents: 1500, projectedCents: 7497,
    discounts: [{ name: 'Temporada baja', base: 'ORIGINAL_VALUE', amountCents: 750 }], discountCents: 750, finalCents: 6747 },
  balanceCents: 6747, status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', seatHeld: false, departureId: 'd-1', paymentType: 'TOTAL', paymentMethod: 'BANK_TRANSFER',
};
const lead = { fullName: 'Persona Ficticia Uno', document: 'DOC-0001', email: 'persona.uno@example.invalid', phone: '3000000000', birthDate: '1990-05-01' };
const command: CreateReservationCommand = { leadCustomerId: 'c-1', departureId: 'd-1', serviceIds: ['t-1'], people: 3, paymentType: 'TOTAL', paymentMethod: 'BANK_TRANSFER' };

describe('reservationsSourceOverTheApiClient', () => {
  it('lists every reservation (scope all, the page hides the archived ones) and reads each one for the values fixed at creation', async () => {
    const { client, calls } = fakeClient({ ok: page([summary]) }, { ok: detail });
    const all = await firstValueFrom(new ReservationsApiSource(client).list());
    expect(calls.map((c) => c.path)).toEqual([`${API_BASE}/reservations?page=1&limit=100&scope=all`, `${API_BASE}/reservations/r-1`]);
    expect(all).toEqual([reservation]);
  });

  it('answers an empty list without reading any detail', async () => {
    const { client, calls } = fakeClient({ ok: page([]) });
    expect(await firstValueFrom(new ReservationsApiSource(client).list())).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('maps the English codes of the wire to the states and payment words the screens know, and keeps the deadline and the validated value when held', async () => {
    const held = { ...detail, reservationStatus: 'COMPLETED', paymentStatus: 'FULLY_PAID', paymentType: 'DEPOSIT', paymentMethod: 'CASH', seatHeld: true,
      conditions: 'Cambios hasta 72 horas antes.', validatedValueCents: 6747, pendingBalanceCents: 0, paymentDeadline: '2026-11-01T09:00:00-05:00' };
    const { client } = fakeClient({ ok: page([{ ...summary, reservationStatus: 'COMPLETED' }]) }, { ok: held });
    const [one] = await firstValueFrom(new ReservationsApiSource(client).list());
    expect(one).toMatchObject({ status: 'FINALIZADA', financialStatus: 'PAGO_COMPLETO', paymentType: 'PARTIAL', paymentMethod: 'CASH_AT_OFFICE', seatHeld: true,
      conditions: 'Cambios hasta 72 horas antes.', validatedCents: 6747, balanceCents: 0, deadline: { dueAt: '2026-11-01T09:00:00-05:00' } });
  });

  it('shows the refusal of the service as the page error', async () => {
    const { client } = fakeClient({ fail: { status: 403, code: 'FORBIDDEN', message: 'Sin permiso.', traceId: 't-1' } });
    expect(await firstValueFrom(new ReservationsApiSource(client).list()).catch((e) => e)).toMatchObject({ status: 403, code: 'FORBIDDEN', userMessage: 'Sin permiso.' });
  });
});

describe('reservationsWriterOverTheApiClient', () => {
  it('creates with the Idempotency-Key and the fields of the contract only: no value, tenant, user or state', async () => {
    const { client, calls } = fakeClient({ ok: detail }, { ok: page([summary]) });
    await firstValueFrom(new ReservationsApiWriter(client).create(command, 'key-12345678'));
    expect(calls[0]).toEqual({ path: `${API_BASE}/reservations`, method: 'POST', headers: { 'Idempotency-Key': 'key-12345678' },
      body: { customerId: 'c-1', serviceId: 't-1', salidaId: 'd-1', people: 3, paymentType: 'FULL_PAYMENT', paymentMethod: 'TRANSFER' } });
  });

  it('sends the companions with the three fields of the contract and leaves an empty birth date out', async () => {
    const { client, calls } = fakeClient({ ok: detail }, { ok: page([summary]) });
    await firstValueFrom(new ReservationsApiWriter(client).create({ ...command, companions: [
      { fullName: 'Persona Ficticia Dos', document: 'DOC-0002', birthDate: '1991-02-03' }, { fullName: 'Persona Ficticia Tres', document: 'DOC-0003', birthDate: '' }] }, 'key-12345678'));
    expect((calls[0].body as { companions: unknown }).companions).toEqual([
      { fullName: 'Persona Ficticia Dos', documentNumber: 'DOC-0002', birthDate: '1991-02-03' }, { fullName: 'Persona Ficticia Tres', documentNumber: 'DOC-0003' }]);
  });

  it('answers the reservation as the service fixed it, named by the row of the list, with no seat held and the balance equal to the final value', async () => {
    const { client, calls } = fakeClient({ ok: detail }, { ok: page([summary]) });
    const created = await firstValueFrom(new ReservationsApiWriter(client).create(command, 'key-12345678'));
    expect(calls[1].path).toBe(`${API_BASE}/reservations?page=1&limit=100&scope=all`);
    expect(created).toEqual(reservation);
    expect(created.seatHeld).toBe(false);
  });

  it('sends the same key again when the screen retries the same creation', async () => {
    const { client, calls } = fakeClient({ ok: detail }, { ok: page([summary]) }, { ok: detail }, { ok: page([summary]) });
    const writer = new ReservationsApiWriter(client);
    await firstValueFrom(writer.create(command, 'key-12345678'));
    await firstValueFrom(writer.create(command, 'key-12345678'));
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.headers?.['Idempotency-Key'])).toEqual(['key-12345678', 'key-12345678']);
  });

  it('sends a titular typed by hand as the holder object of the contract, in the same call and under the same key, and no customerId', async () => {
    const { client, calls } = fakeClient({ ok: detail }, { ok: page([summary]) });
    const { leadCustomerId: _id, ...typed } = command;
    await firstValueFrom(new ReservationsApiWriter(client).create({ ...typed, lead, acceptedTerms: true }, 'key-12345678'));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(calls[0]).toEqual({ path: `${API_BASE}/reservations`, method: 'POST', headers: { 'Idempotency-Key': 'key-12345678' },
      body: { holder: { fullName: 'Persona Ficticia Uno', documentNumber: 'DOC-0001', birthDate: '1990-05-01',
        contact: { email: 'persona.uno@example.invalid', phone: '3000000000' }, termsAccepted: true },
        serviceId: 't-1', salidaId: 'd-1', people: 3, paymentType: 'FULL_PAYMENT', paymentMethod: 'TRANSFER' } });
  });

  it('leaves an empty birth date out of the holder and never types the risk mark or the tour into it', async () => {
    const { client, calls } = fakeClient({ ok: detail }, { ok: page([summary]) });
    const { leadCustomerId: _id, ...typed } = command;
    await firstValueFrom(new ReservationsApiWriter(client).create({ ...typed, lead: { ...lead, birthDate: '' }, acceptedTerms: true }, 'key-12345678'));
    const holder = (calls[0].body as { holder: Record<string, unknown> }).holder;
    expect(Object.keys(holder).sort()).toEqual(['contact', 'documentNumber', 'fullName', 'termsAccepted']);
  });

  it('sends the consent and the emergency info of a high-risk titular and of each companion, in the shape of the contract', async () => {
    const { client, calls } = fakeClient({ ok: detail }, { ok: page([summary]) });
    const { leadCustomerId: _id, ...typed } = command;
    const risk = { informedConsent: true, bloodType: 'O+', emergencyContact: 'Contacto Ficticio 3000000001', physicalRestrictions: 'Ninguna' };
    const companion = { fullName: 'Persona Ficticia Dos', document: 'DOC-0002', birthDate: '1992-01-01', highRisk: { ...risk, bloodType: 'A-' } };
    await firstValueFrom(new ReservationsApiWriter(client).create({ ...typed, lead: { ...lead, highRisk: risk }, companions: [companion], acceptedTerms: true }, 'key-12345678'));
    const body = calls[0].body as { holder: Record<string, unknown>; companions: Record<string, unknown>[] };
    expect(body.holder).toMatchObject({ informedConsentSigned: true, emergencyInfo: { bloodType: 'O+', emergencyContact: 'Contacto Ficticio 3000000001', mobilityRestrictions: 'Ninguna' } });
    expect(body.companions).toEqual([{ fullName: 'Persona Ficticia Dos', documentNumber: 'DOC-0002', birthDate: '1992-01-01', informedConsentSigned: true,
      emergencyInfo: { bloodType: 'A-', emergencyContact: 'Contacto Ficticio 3000000001', mobilityRestrictions: 'Ninguna' } }]);
  });

  it('sends none of the risk fields for a tour that is not high risk', async () => {
    const { client, calls } = fakeClient({ ok: detail }, { ok: page([summary]) });
    const { leadCustomerId: _id, ...typed } = command;
    await firstValueFrom(new ReservationsApiWriter(client).create({ ...typed, lead, companions: [{ fullName: 'Persona Ficticia Dos', document: 'DOC-0002', birthDate: '' }], acceptedTerms: true }, 'key-12345678'));
    expect(JSON.stringify(calls[0].body)).not.toMatch(/informedConsentSigned|emergencyInfo/);
  });

  it('does not make up the acceptance of the terms: without it the holder says false and the service refuses', async () => {
    const { client, calls } = fakeClient({ ok: detail }, { ok: page([summary]) });
    const { leadCustomerId: _id, ...typed } = command;
    await firstValueFrom(new ReservationsApiWriter(client).create({ ...typed, lead }, 'key-12345678'));
    expect((calls[0].body as { holder: { termsAccepted: boolean } }).holder.termsAccepted).toBe(false);
  });

  it('sends exactly one of the customer and the holder: a chosen customer wins over a typed titular', async () => {
    const { client, calls } = fakeClient({ ok: detail }, { ok: page([summary]) });
    await firstValueFrom(new ReservationsApiWriter(client).create({ ...command, lead, acceptedTerms: true }, 'key-12345678'));
    expect(Object.keys(calls[0].body as object)).toContain('customerId');
    expect(Object.keys(calls[0].body as object)).not.toContain('holder');
  });

  it('builds no call when neither a customer nor a titular is given', async () => {
    const { client, calls } = fakeClient();
    const { leadCustomerId: _id, ...typed } = command;
    const error = await firstValueFrom(new ReservationsApiWriter(client).create(typed, 'key-12345678')).catch((e) => e);
    expect(error).toMatchObject({ code: 'NOT_IN_CONTRACT' });
    expect(calls).toEqual([]);
  });

  it('shows the refusal of the service as the form error', async () => {
    const { client } = fakeClient({ fail: { status: 422, code: 'BUSINESS_RULE_VIOLATION', message: 'La salida no tiene cupo.', traceId: 't-1' } });
    expect(await firstValueFrom(new ReservationsApiWriter(client).create(command, 'key-12345678')).catch((e) => e)).toMatchObject({ status: 422, userMessage: 'La salida no tiene cupo.' });
  });
});

describe('sourceProvidersOfTheReservations', () => {
  it('provides the list and the creation over the container client', () => {
    const providers = sourceProviders(fakeClient().client) as { provide: unknown; useValue?: unknown }[];
    expect(providers.find((p) => p.provide === ReservationsSource)?.useValue).toBeInstanceOf(ReservationsApiSource);
    expect(providers.find((p) => p.provide === ReservationsWriter)?.useValue).toBeInstanceOf(ReservationsApiWriter);
  });
});
