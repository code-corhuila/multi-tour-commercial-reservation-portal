import { formatDate } from '../shared/format';
import type { ReschedulingRefusal } from './data/rescheduling-ports';

/** Spanish copy of admin-reprogramar-reserva.html (mockup), HU-COM-018; PROPUESTO marks a text the mockup does not have (spec section 5). */
export const RESCHEDULING_COPY = {
  eyebrow: 'RF-015C · Salida afectada', title: 'Propuesta de reprogramación', back: 'Volver a reservas',
  reservation: 'Reserva', heroTitle: 'Salida cancelada o interrumpida', episodeLeft: (hours: number) => `Episodio: quedan ${hours} h`,
  deadlinesTitle: 'Plazos del episodio',
  deadlines: 'El Administrador propone una nueva salida dentro de 24 horas corridas. Si no propone, la reserva se cancela con devolución del 100 %. '
    + 'El cliente tiene 72 horas corridas para aceptar o rechazar; el límite absoluto del episodio es 96 horas.',
  newDeparture: 'Nueva salida', customerAnswer: 'Respuesta del cliente', answers: ['Pendiente de respuesta', 'Aceptar', 'Rechazar'],
  heldNote: 'Los cupos de la salida propuesta quedan apartados hasta aceptar, rechazar, vencer el plazo, llegar la hora programada o cancelarse la salida propuesta.',
  cancel: 'Cancelar con devolución 100 %', send: 'Enviar propuesta',
  /** PROPUESTO: the mockup draws no feedback for these two buttons. */
  sent: 'Propuesta enviada al cliente.',
  cancelled: (amount: string) => `La reserva queda Cancelada y se devuelve el 100 % de los valores pagados y validados: ${amount}.`,
  loading: 'Cargando…', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar',
  /** PROPUESTO: the reservation has no rescheduling episode. */
  none: 'Esta reserva no tiene un episodio de reprogramación.',
} as const;

/** PROPUESTO (spec AC-RP.3, AC-RP.4, AC-RP.9): why the service refused; the mockup has no such texts. */
export const REFUSAL_TEXT: Readonly<Record<ReschedulingRefusal, string>> = {
  'proof-in-validation': 'La reserva tiene un comprobante En validación: no se puede reprogramar hasta resolverlo.',
  'no-seats': 'La salida propuesta no tiene cupos para todos los viajeros de la reserva. La reserva conserva su salida y su cupo.',
  'already-answered': 'La propuesta ya tiene una respuesta registrada.',
  closed: 'El episodio de reprogramación ya está cerrado.',
};

/** `2026-10-18T06:30:00-05:00` to `18 oct 2026 · 06:30`, as the mockup writes a departure. */
export function startLine(iso: string): string {
  const time = /T(\d{2}:\d{2})/.exec(iso)?.[1];
  return time ? `${formatDate(iso)} · ${time}` : formatDate(iso);
}
