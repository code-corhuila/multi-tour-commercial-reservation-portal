/** Texts of the portal shell (client header, notifications bell, footer and operator sidebar), in one place. */
export const SHELL_TEXT = {
  brandStart: 'MULTI', brandEnd: 'TOUR', brandPlain: 'Multitour', operatorBrand: 'MULTITOUR',
  clientNavLabel: 'Navegación principal del cliente',
  notifications: 'Notificaciones', noNotifications: 'No tienes notificaciones nuevas.',
  footerAbout: 'Plataforma para descubrir, reservar y gestionar experiencias de turismo con operadores locales.',
  footerExplore: 'Explorar',
  footerBottom: '© 2026 Multitour. Plataforma para operadores de turismo.',
  operatorNavLabel: 'Administración comercial',
} as const;

/** The sidebar and navigation labels of the portal areas (portal-areas.ts), by area key. */
export const AREA_LABEL = {
  reservations: 'Reservas',
  catalog: 'Catálogos',
  catalogTours: 'Gestionar catálogo de tours',
  establishments: 'Establecimientos',
  discounts: 'Descuentos',
  currentDiscounts: 'Descuentos vigentes',
  clientTours: 'Explorar',
  clientLodging: 'Alojamiento',
  clientGastronomy: 'Gastronomía',
  customers: 'Titular y acompañantes',
  clientPanel: 'Mis reservas',
  clientReservations: 'Mis reservas',
  reserve: 'Reservar tour',
  finish: 'Finalizar reserva',
  paymentManagement: 'Gestión de pago',
  rESERVATIONCHANGESCREEN: 'Cancelar o modificar reserva',
  transferPayment: 'Pago por transferencia',
  received: 'Comprobante recibido',
  rejected: 'Comprobante rechazado',
  payments: 'Pagos',
  paymentsValidate: 'Validar comprobante',
  paymentsFollowup: 'Registrar seguimiento',
  clientPayments: 'Mis pagos',
  requests: 'Solicitudes de devolución',
  detail: 'Detalle de devolución',
  manage: 'Gestionar devolución',
  treatment: 'Tratamiento pendiente de devolución',
  cREDITBALANCEAREA: 'Saldo a favor',
  notifications: 'Notificaciones',
  rESCHEDULINGAREA: 'Propuesta de reprogramación',
  pROPOSALAREA: 'Propuesta de reprogramación',
} as const;

/** The labels of the client header, account, panel and footer links. */
export const CLIENT_LINK_LABEL = {
  navClientTours: 'Explorar',
  navClientLodging: 'Alojamiento',
  navClientGastronomy: 'Gastronomía',
  accountClientReservations: 'Mis reservas',
  panelClientTours: 'Ver catálogo',
  panelClientPanel: 'Volver al panel',
  footerClientTours: 'Tours',
  footerClientLodging: 'Alojamiento',
  footerClientGastronomy: 'Gastronomía',
} as const;
