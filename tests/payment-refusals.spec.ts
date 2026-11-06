import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { PaymentsApiWriter } from '../src/app/http/payments-api-sources';
import { fakeClient } from './api-client.double';

// HU-COM-009, debt of the deep audit (code-corhuila/multi-tour-docs#175): the service answers in English; the screens of 13 and 24 must say
// the refusal in Spanish (AC-PY.4, AC-PY.5, AC-PY.7 and the copy catalog), keyed by status + code + the field/message the envelope carries.
const envelope = (status: number, code: string, message: string, details: Array<{ field: string; message: string }> = []) => ({ status, code, message, details, traceId: 't-1' });
const refusal = async (fail: unknown) => {
  const { client } = fakeClient({ fail });
  return (await firstValueFrom(new PaymentsApiWriter(client).register({ reservationId: 'r-1', amountCents: 4000, proof: null }, 'key-12345678')).catch((e) => e)) as { status: number; code: string; traceId: string; userMessage: string };
};
const rule = (message: string) => envelope(422, 'BUSINESS_RULE_VIOLATION', message);
const field = (name: string, message: string) => envelope(400, 'VALIDATION_ERROR', 'the request has invalid fields', [{ field: name, message }]);
const GENERIC = 'No se pudo completar la solicitud.';

describe('paymentRefusalsAreSpanish', () => {
  it.each([
    ['AC-PY.4 cash without an open cash session', rule('there is no open cash session'), 'No hay una sesión de caja abierta: el pago en efectivo no se registró.'],
    ['AC-PY.5 first payment without availability', rule('the departure has no availability'), 'La salida no tiene cupo suficiente: el sistema no recibe el primer pago ni aparta cupo.'],
    ['AC-PY.5 seats unavailable code', envelope(422, 'SEATS_UNAVAILABLE', 'not enough seats: 2 seats available'), 'La salida no tiene cupo suficiente: el sistema no recibe el primer pago ni aparta cupo.'],
    ['AC-PY.7 the departure already started', rule('the departure has already started'), 'Se alcanzó la hora programada de inicio de la salida: ya no se aceptan pagos ni comprobantes.'],
    ['the payment deadline expired', rule('the payment deadline has expired'), 'El plazo de pago venció: la reserva ya no admite pagos ni comprobantes.'],
    ['the departure was cancelled', rule('the departure was cancelled'), 'La salida fue cancelada: no se aceptan pagos.'],
    ['the reservation is closed', rule('the reservation does not accept payments in its current state'), 'Esta reserva ya no admite pagos.'],
    ['the reservation has no balance', rule('the reservation has no pending balance'), 'No existen valores pendientes por registrar para esta reserva.'],
    ['deposit below the minimum', field('amountCents', 'the first deposit cannot be below the minimum deposit'), 'El abono no puede ser menor al abono mínimo del servicio.'],
    ['transfer above the balance', field('amountCents', 'the transfer cannot exceed the pending balance'), 'El valor transferido no puede superar el saldo pendiente.'],
    ['amount not positive', field('amountCents', 'amountCents must be greater than zero'), 'Registra un monto mayor a $0.'],
    ['method not enabled', field('paymentMethod', 'the payment type or method is not enabled'), 'El tipo o el medio de pago no está habilitado para este servicio.'],
    ['proof too large', envelope(413, 'PAYLOAD_TOO_LARGE', 'The file is too large.'), 'El comprobante supera el tamaño máximo de 5 MB.'],
    ['proof of a wrong type', envelope(415, 'UNSUPPORTED_MEDIA_TYPE', 'This file type is not allowed.'), 'El comprobante debe ser PDF, JPG, JPEG o PNG y no superar 5 MB.'],
    ['forbidden', envelope(403, 'FORBIDDEN', 'access is forbidden'), 'Tu rol es de solo consulta: no puede registrar pagos.'],
    ['reservation not found', envelope(404, 'NOT_FOUND', 'resource not found'), 'No se encontró la reserva seleccionada. Vuelve a Reservas u Operación e ingresa nuevamente por Gestionar pago.'],
    ['too many requests', envelope(429, 'HTTP_ERROR', 'Too many requests. Wait a moment and try again.'), 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.'],
    ['service unavailable', envelope(503, 'HTTP_ERROR', 'This service is not available right now. Try again later.'), 'El servicio no está disponible en este momento. Intenta más tarde.'],
  ])('%s', async (_name, fail, text) => {
    expect((await refusal(fail)).userMessage).toBe(text);
  });

  it('falls back to the generic Spanish text for a refusal it does not know, never the English message', async () => {
    for (const fail of [rule('a rule nobody mapped yet'), field('anything', 'has a strange value'), envelope(500, 'INTERNAL_ERROR', 'an unexpected error occurred'), envelope(422, 'BUSINESS_RULE_VIOLATION', 'the minimum deposit is not configured')]) {
      expect((await refusal(fail)).userMessage).toBe(GENERIC);
    }
  });

  it('keeps the status, the code and the trace of the refusal for the logs', async () => {
    expect(await refusal(rule('there is no open cash session'))).toMatchObject({ status: 422, code: 'BUSINESS_RULE_VIOLATION', traceId: 't-1' });
  });

  it('does not touch a failure the portal itself declares in Spanish', async () => {
    expect((await refusal({ status: 0, code: 'NOT_IN_CONTRACT', message: 'El pago no está en el contrato.', details: [], traceId: '', userMessage: 'El pago no está en el contrato.' })).userMessage).toBe('El pago no está en el contrato.');
  });
});
