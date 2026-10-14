/** Texts of screens 10A ("Pagos y comprobantes"), 10C ("Gestionar pago") and 13 (admin-gestion-pago.html), as the mockup writes them. */
export const PAYMENTS_TEXT = {
  manage: 'Gestionar pago', blockEyebrow: 'Pagos y comprobantes', blockTitle: 'Seguimiento económico',
  columns: ['Tipo', 'Medio', 'Estado del comprobante', 'Situación financiera', 'Valores validados', 'Saldo pendiente'],
  eyebrow: 'Seguimiento de reserva', title: 'Gestión de pago', reservation: 'Reserva',
  infoEyebrow: 'Información de pago', modality: 'Tipo y medio de pago', departure: 'Salida', deadline: 'Plazo de pago', validated: 'Valores validados', proofState: 'Estado del comprobante', financial: 'Situación financiera',
  economyEyebrow: 'Estado económico', final: 'Valor final', balance: 'Saldo pendiente',
  actionEyebrow: 'Acción de pago', actionTitle: 'Registra el pago de esta reserva', actionCopy: 'El comprobante no es ingreso de caja hasta su validación.',
  amount: 'Monto recibido', partialAmount: 'Monto del abono', proof: 'Comprobante de transferencia', back: 'Volver a la reserva',
  submit: { transfer: 'Registrar comprobante', partial: 'Registrar abono', total: 'Registrar pago' },
  /** Spec 009- section 5: the mockup's transfer answer; its cash answers move the financial situation (RN-PY1) and are not used. */
  registered: { transfer: 'Comprobante registrado en nombre del cliente. Queda En validación y la reserva sigue Pendiente de pago hasta su aprobación.',
    cash: 'Pago registrado. Queda pendiente de validación y la reserva permanece pendiente de pago.' },
  noModalityFeedback: 'No hay una modalidad de pago habilitada para esta reserva. Defínela antes de registrar dinero.',
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

/** `1 viajero`, `2 viajeros` (screens 22, 23 and 24 write it as the mockup does). */
export const viajeros = (people: number) => `${people} ${people === 1 ? 'viajero' : 'viajeros'}`;

/** Texts of the method block of 21 (finalizar-reserva.html) and of 24 (pago-transferencia.html), as the mockup writes them. */
export const CUSTOMER_PAYMENT_TEXT = {
  blockTitle: 'Tipo de pago y plazo', typeTitle: 'Tipo de pago (la condición económica de la reserva)', deposit: 'Monto a abonar', depositPlaceholder: 'Ej. 500000',
  typeHint: { TOTAL: 'Se confirma cuando se valida el 100 % del valor final, en uno o varios pagos.', PARTIAL: 'Se confirma cuando se valida como mínimo el abono mínimo del servicio; el saldo queda pendiente con plazo propio.' } as Readonly<Record<string, string>>,
  depositHint: 'El abono mínimo se calcula sobre el valor final después de aplicar descuentos. El saldo pendiente se calcula con base en el valor efectivamente abonado.',
  depositInvalid: 'Ingresa un monto de abono válido (mayor a cero y hasta el valor final).',
  cashHint: 'Elegir efectivo registra solo una promesa de pago: no es un pago validado, no confirma la reserva y no aparta cupo. La reserva queda Pendiente de pago y únicamente cuenta cuando el equipo del operador reciba y registre el dinero dentro del plazo.',
  transferHint: 'La reserva sigue Pendiente de pago hasta que un usuario autorizado valide tu pago. El comprobante (PDF, JPG, JPEG o PNG, máximo 5 MB) queda En validación únicamente cuando lo envías.', continue: 'Continuar al pago',
  /** Rules of pago-transferencia.html with no date: the plazo itself is the service's (blocked by contract: no deadline port at creation). */
  deadline: ['Límite absoluto: ningún plazo supera la hora de inicio de la salida; desde esa hora no se admiten pagos ni comprobantes. Si no se cumple el pago en el plazo, la reserva se cancela automáticamente y el cupo se libera.',
    'Si presentas un comprobante dentro del plazo, la reserva no se cancela mientras esté En validación. El cupo se aparta con tu primer pago, no al crear la reserva.'],
  balanceRule: 'Saldo del abono: una vez Confirmada, debes completarlo y que sea validado antes del plazo configurado por el operador; nunca después de la hora de inicio de la salida.',
  title: 'Pago por transferencia', reservation: 'Reserva',
  alert: 'Realiza la transferencia y sube el comprobante. El comprobante queda En validación solo cuando lo envías; no es ingreso de caja ni confirma la reserva hasta que un usuario del operador con el permiso Validar comprobantes lo valide, en un plazo máximo de 24 horas corridas.',
  typeName: { TOTAL: 'Pago total', PARTIAL: 'Abono' } as Readonly<Record<string, string>>, transferMethod: ' · Transferencia',
  yourReservation: 'Tu reserva', tour: 'Tour', departure: 'Salida', travelers: 'Viajeros', typeAndMethod: 'Tipo y medio de pago', toTransfer: 'Valor a transferir',
  seatNote: 'Si es tu primer pago, el cupo se verifica y se aparta al recibir el comprobante, antes de aceptarlo. Si ya no hay cupo, te lo informaremos y no se recibirá el comprobante.',
  bankTitle: 'Datos bancarios', bank: 'Banco', accountType: 'Tipo de cuenta', accountNumber: 'Número de cuenta', holder: 'Titular',
  proofTitle: 'Comprobante de pago', proof: 'Archivo del comprobante (PDF, JPG, JPEG o PNG; máximo 5 MB)',
  proofState: 'Estado del comprobante:', financial: 'Situación financiera:', send: 'Enviar comprobante para validación', panel: 'Volver a mis reservas',
  chooseProof: 'Selecciona un comprobante para continuar.', validProof: 'Archivo válido. El comprobante quedará En validación solo cuando lo envíes.',
  none: 'No hay una reserva pendiente de transferencia. Vuelve a Explorar para crear una reserva.',
};

const DEPARTURE_STATE: Readonly<Record<string, string>> = { PROGRAMADA: 'Programada', EN_CURSO: 'En ejecución', FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada' };
/** "Salida" of 13 and of the follow-up (app.js 10170, 5072): tour, date and state; the SAL- code is not in the contract (blocked). */
export const departureText = (r: { tourName: string; departureDate: string }, state?: string) =>
  `${r.tourName} · ${departureLine(r.departureDate)}${state ? ` (${DEPARTURE_STATE[state] ?? state})` : ''}`;
