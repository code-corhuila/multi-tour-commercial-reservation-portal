import { formatCop } from '../../shared/format';

/** HU-COM-012: the texts of the panel are the mockup's (admin-cancelar-modificar-reserva.html, app.js); the policy answers and the seat message are PROPUESTO (spec section 5). */
export const TRAVELLERS_MODIFICATION_COPY = {
  label: 'Modificación de servicio, salida o viajeros',
  allowed: 'La política del tour admite la modificación de viajeros en esta reserva.',
  refused: {
    'not-allowed': 'La política del tour no admite la modificación de viajeros en esta reserva.',
    'not-before-execution': 'La modificación de viajeros solo se admite antes de la ejecución de la reserva.',
  },
  eyebrow: 'Modificación', title: 'Nuevo servicio, salida y viajeros',
  note: 'Los valores se recalculan con las reglas de descuento fijadas en la reserva; los pagos validados no se pierden. Si el valor final queda por debajo de lo pagado, el excedente se trata con la decisión de 24 horas del Administrador del tenant (devolución del 100 % por defecto o saldo a favor). Al reducir viajeros los cupos se liberan de inmediato.',
  service: 'Servicio (tour)', departure: 'Salida', travellers: 'Cantidad de viajeros',
  travellersInvalid: 'Indica la cantidad de viajeros (mínimo 1).', noSeats: 'La salida no tiene cupos para este cambio.',
  lines: { projected: 'Valor proyectado', discount: 'Descuentos', final: 'Valor final', balance: 'Saldo pendiente' }, unavailable: '—',
  /** app.js: the text the screen keeps under the actions after "Registrar novedad". */
  registered: (excessCents: number) => (excessCents > 0
    ? `Modificación registrada y valores recalculados. Excedente determinado: ${formatCop(excessCents)} (devolución del 100 % o saldo a favor, decisión del Administrador del tenant en 24 horas).`
    : 'Modificación registrada y valores recalculados.'),
  history: { eyebrow: 'Historial', title: 'Modificaciones registradas', columns: ['Fecha', 'Valor original', 'Valor recalculado', 'Saldo resultante', 'Causal', 'Registrado por'] },
  loading: 'Cargando…', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar', notFound: 'No se encontró la reserva seleccionada.',
} as const;
