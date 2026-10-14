import { departureLine } from '../shared/format';
/** Texts of screens 10A ("Pagos y soportes"), 10C ("Gestionar pago") and 13 (admin-gestion-pago.html), as the mockup writes them. */
export const PAYMENTS_TEXT = {
  manage: 'Gestionar pago', blockEyebrow: 'Pagos y comprobantes', blockTitle: 'Seguimiento económico', receiptsEyebrow: 'Histórico', receiptsTitle: 'Comprobantes presentados',
  receiptColumns: ['Presentado', 'Valor declarado', 'Monto verificado', 'Estado', 'Decisión'], noReceipts: 'Sin comprobantes presentados.', pendingDecision: 'Pendiente de decisión',
  columns: ['Tipo', 'Medio', 'Estado del comprobante', 'Situación financiera', 'Valores validados', 'Saldo pendiente'],
  eyebrow: 'Seguimiento de reserva', title: 'Gestión de pago', reservation: 'Reserva',
  infoEyebrow: 'Información de pago', modality: 'Tipo y medio de pago', departure: 'Salida', deadline: 'Plazo de pago', validated: 'Valores validados', proofState: 'Estado del comprobante', financial: 'Situación financiera',
  economyEyebrow: 'Estado económico', final: 'Valor final', balance: 'Saldo pendiente',
  actionEyebrow: 'Acción de pago', actionTitle: 'Registra el pago de esta reserva', actionCopy: 'El comprobante no es ingreso de caja hasta su validación y la reserva permanece Pendiente de pago hasta cumplir la condición de confirmación (100 % del valor final en pago total, abono mínimo en abono). Registra aquí el efectivo recibido o el comprobante en nombre del cliente: el sistema verifica el cupo de la salida antes de recibirlo. La revisión máxima del comprobante es de 24 horas corridas.',
  amount: 'Monto recibido', partialAmount: 'Monto del abono', proof: 'Comprobante de transferencia (PDF, JPG, JPEG o PNG, máximo 5 MB)', back: 'Volver a la reserva',
  submit: { transfer: 'Registrar comprobante', partial: 'Registrar pago recibido', total: 'Registrar pago recibido' },
  readOnly: 'Tu rol es de solo consulta: no puede registrar pagos.',
  hint: 'Registra el monto para actualizar la situación financiera y el saldo pendiente.',
  inValidation: 'Hay un comprobante En validación. La reserva sigue sin confirmarse hasta su aprobación.',
  completed: { total: 'Total validado', movements: 'Movimientos', cash: 'Efectivo recibido', proof: 'Comprobante aprobado' },
  started: 'Se alcanzó la hora programada de inicio de la salida: ya no se aceptan pagos ni comprobantes.',
  noSeats: (departure: string, free: number, people: number) => `La salida ${departure} no tiene cupo suficiente (${free} disponible${free === 1 ? '' : 's'} para ${people} viajeros): el sistema no recibe el primer pago ni aparta cupo.`,
  /** Mockup app.js 10300-10340: the answers of 13; cash is validated when registered (RF-015A, D9), so its answer tells the new situation. */
  registered: { transfer: 'Comprobante registrado en nombre del cliente. Queda En validación y la reserva sigue Pendiente de pago hasta su aprobación.',
    confirmed: 'Pago en efectivo registrado. Se cumplió la condición de confirmación y la reserva quedó Confirmada.',
    cash: (financial: string, surplus: string) => `Pago en efectivo registrado. Situación financiera: ${financial}.${surplus ? ` El excedente de ${surplus} quedó como saldo a favor.` : ''}` },
  noModalityFeedback: 'No hay un medio de pago definido para esta reserva. Defínelo antes de registrar dinero.',
  /** Mockup app.js 6713-6718: the heading and note of a cancelled or settled reservation. */
  closedTitle: { cancelled: 'Reserva cancelada', settled: 'Pago registrado' } as Readonly<Record<string, string>>,
  closedNote: { cancelled: 'Esta reserva está cancelada: no se pueden registrar nuevos pagos ni comprobantes. Se conserva la trazabilidad existente.',
    settled: 'No existen valores pendientes por registrar para esta reserva.' } as Readonly<Record<string, string>>,
  /** Spec 009- section 5: 13 has no text for En ejecución and Finalizada; the mockup's own sentence for them (app.js 6079). */
  closedState: (status: string) => `Esta reserva está en estado "${status}" y ya no admite modificaciones.`,
  amountRequired: 'Registra un monto mayor a $0.', proofRequired: 'Adjunta el comprobante de transferencia para enviarlo a validación.',
  registeredBy: 'Registrado por', noModality: 'Sin modalidad definida', noProof: 'Sin comprobante',
  loading: 'Cargando…', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar',
  notFound: 'No se encontró la reserva seleccionada. Vuelve a Reservas u Operación e ingresa nuevamente por Gestionar pago.',
  proofStatus: { EN_VALIDACION: 'En validación', SIN_COMPROBANTE: 'Sin comprobante', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado' } as Readonly<Record<string, string>>,
};

/** Texts of the method block of 21 (finalizar-reserva.html) and of 24 (pago-transferencia.html), as the mockup writes them. */
export const CUSTOMER_PAYMENT_TEXT = {
  blockTitle: 'Método y plazo de pago', typeTitle: 'Tipo de pago', deposit: 'Monto a abonar', depositPlaceholder: 'Ej. 500000',
  typeHint: { TOTAL: 'Completa el valor final de la reserva.', PARTIAL: 'Confirma según el abono mínimo parametrizado y conserva el saldo pendiente.' } as Readonly<Record<string, string>>,
  depositHint: 'El abono mínimo se calcula sobre el valor final después de aplicar descuentos. El saldo pendiente se calcula con base en el valor efectivamente abonado.',
  depositInvalid: 'Ingresa un monto de abono válido (mayor a cero y hasta el valor final).',
  cashOption: 'El pago en efectivo será registrado por el equipo del operador.',
  cashHint: 'El pago en efectivo no confirma la reserva hasta que el dinero sea recibido y registrado por el equipo del operador.',
  transferHint: 'La transferencia queda pendiente de revisión mediante comprobante.', continue: 'Continuar al pago',
  title: 'Pago por transferencia', reservation: 'Reserva',
  alert: 'Realiza la transferencia y sube obligatoriamente la imagen del comprobante. El archivo queda En validación y no es ingreso de caja hasta que el Administrador lo apruebe.',
  bankTitle: 'Datos bancarios', bank: 'Banco', accountType: 'Tipo de cuenta', accountNumber: 'Número de cuenta', holder: 'Titular',
  proofTitle: 'Comprobante obligatorio', reference: 'Código de referencia:', proof: 'Imagen del comprobante (PDF, JPG, JPEG o PNG; máximo 5 MB)',
  proofState: 'Estado del comprobante:', financial: 'Situación financiera:', send: 'Enviar comprobante para validación', panel: 'Volver al panel',
  chooseProof: 'Selecciona un comprobante para continuar.', validProof: 'Archivo válido. El comprobante quedará En validación hasta su revisión.',
  none: 'No hay una reserva pendiente de transferencia. Vuelve a Explorar para crear una reserva.',
};

const DEPARTURE_STATE: Readonly<Record<string, string>> = { PROGRAMADA: 'Programada', EN_CURSO: 'En ejecución', FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada' };
/** "Salida" of 13 and of the follow-up (app.js 10170, 5072): tour, date and state; the SAL- code is not in the contract (blocked). */
export const departureText = (r: { tourName: string; departureDate: string }, state?: string) =>
  `${r.tourName} · ${departureLine(r.departureDate)}${state ? ` (${DEPARTURE_STATE[state] ?? state})` : ''}`;
