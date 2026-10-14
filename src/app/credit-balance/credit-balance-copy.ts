import { formatDate } from '../shared/format';

/** `2026-10-15T10:00:00-05:00` to `15 oct 2026 · 10:00`, the hour as written. */
export const formatDateTime = (iso: string) => `${formatDate(iso)} · ${iso.slice(11, 16)}`;

/** Spanish copy of admin-tratamiento-pendiente-devolucion.html, admin-detalle-devolucion.html and admin-saldo-favor.html (mockup f6ba1c4 and app.js), HU-COM-017. */
export const CREDIT_BALANCE_COPY = {
  record: 'Registrar saldo a favor del 100 %', pending: 'Saldo a favor pendiente', amount: 'Monto', owner: 'Responsable', date: 'Fecha',
  loading: 'Cargando…', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar',
  eyebrow: 'RN-RES-009 · GAP-014 · GAP-015', title: 'Saldo a favor', back: 'Volver a Pagos', link: 'Saldo a favor',
  note: 'El saldo a favor es del cliente dentro de este tenant: no vence y no se transfiere a otros tenants. Se aplica como pago validado (sin comprobante) a una reserva del mismo cliente y, si es su primer pago, aparta el cupo en la misma operación. La devolución la autoriza el Administrador del tenant dentro de 24 horas corridas (sin decisión, se autoriza el monto disponible y se notifica a los Administradores) y se ejecuta en máximo 5 días hábiles.',
  summary: ['Saldo disponible del tenant', 'Clientes con saldo', 'Devoluciones por decidir (24 h)'],
  empty: 'Ningún cliente del tenant tiene saldo a favor. Se genera por excedentes de pago, reducciones de valor o decisiones del Administrador sobre valores en tratamiento.',
  customer: 'Cliente', unknownCustomer: 'Cliente sin identificar', available: (money: string) => `Disponible ${money}`,
  sourceColumns: ['Reserva de origen', 'Saldo neto', 'En devolución', 'Disponible', ''], applyTo: 'Aplicar a la reserva', target: (id: string, balance: string) => `#${id} · saldo ${balance}`,
  apply: 'Aplicar como pago validado', noTargets: 'El cliente no tiene reservas con saldo pendiente donde aplicar.',
  history: (n: number) => `Historial de aplicaciones y devoluciones (${n})`, historyColumns: ['Fecha', 'Movimiento', 'Detalle', 'Reserva', 'Valor', 'Responsable'],
  movement: { ORIGEN: 'Origen', APLICACION: 'Aplicación', DEVOLUCION: 'Devolución' }, state: { PENDIENTE_DE_AUTORIZACION: 'Pendiente de autorización', RECHAZADA: 'Rechazada' },
  origin: { TRATAMIENTO: 'Tratamiento pendiente registrado como saldo a favor del 100 %', EXCEDENTE: 'Excedente de comprobante aprobado' }, appliedTo: (id: string) => `Aplicado a la reserva ${id}`,
  requestsEyebrow: 'Devoluciones', requestsTitle: 'Solicitudes de devolución de saldo a favor', requestsColumns: ['Origen', 'Cliente', 'Monto', 'Estado', 'Decisión hasta'],
  noRequests: 'Sin solicitudes de devolución de saldo a favor.',
  applied: (money: string, id: string, first: boolean) => `Saldo a favor aplicado: ${money} como pago validado de ${id}${first ? '; el cupo quedó apartado en la misma operación' : ''}. Queda en auditoría.`,
  refusal: { notFound: 'No se encontró la reserva.', state: (label: string) => `La reserva está ${label}: no admite pagos nuevos.`, started: 'Desde la hora programada de inicio de la salida no se admiten pagos.',
    noPending: 'La reserva no tiene saldo pendiente.', zero: 'Indica un monto mayor a cero.', aboveAvailable: (money: string) => `El monto supera el saldo a favor disponible (${money}).`,
    abovePending: (money: string) => `El monto supera el saldo pendiente de la reserva (${money}).`, noSeats: (n: number) => `No hay cupo suficiente en esta salida: ${n === 1 ? 'queda 1 cupo' : `quedan ${n} cupos`}. No se aplicó el saldo a favor.`,
  },
} as const;
