import {
  ComponentRef, Directive, InjectionToken, Injector, OnChanges, Provider, SimpleChanges, Type, ViewContainerRef, inject, input, reflectComponentType,
} from '@angular/core';

/** What a story adds to another story's page (HU-COM-001 portal foundation of 2026-10-13): drawn by order, only when its ports exist. */
export interface PortalSlot {
  readonly component: Type<unknown>;
  readonly order: number;
  readonly isAvailable?: (injector: Injector) => boolean;
}
export type PortalSlotToken = InjectionToken<readonly PortalSlot[]>;

/** The provider a story registers in mount-entry.ts or in its demo providers; never an edit of the hosting page. */
export const contribute = (slot: PortalSlotToken, entry: PortalSlot): Provider => ({ provide: slot, multi: true, useValue: entry });

/** 10A: panels after "Servicios reservados"; 10C: actions next to "Ver detalle". Inputs: reservation, fresh (true on 10C). */
export const RESERVATION_DETAIL_BLOCKS: PortalSlotToken = new InjectionToken('RESERVATION_DETAIL_BLOCKS');
/** 10 (admin-reservas): actions of the "Acción" cell after "Ver detalle"; each draws its own " · ". Input: reservation. */
export const RESERVATION_ROW_ACTIONS: PortalSlotToken = new InjectionToken('RESERVATION_ROW_ACTIONS');
/** 21 (finalizar-reserva): blocks of the main column after the payment method card. Inputs: quote, method (the chosen code), reservation (once created). */
export const CHECKOUT_BLOCKS: PortalSlotToken = new InjectionToken('CHECKOUT_BLOCKS');
/** 24 (pago-transferencia): lines of the transfer payment page; the outlet comes with that page. */
export const TRANSFER_PAYMENT_LINES: PortalSlotToken = new InjectionToken('TRANSFER_PAYMENT_LINES');
/** 13 sub-screen (admin-gestion-pago): actions of the payment management page; the outlet comes with that page. */
export const PAYMENT_MANAGEMENT_ACTIONS: PortalSlotToken = new InjectionToken('PAYMENT_MANAGEMENT_ACTIONS');
/** 13 sub-screen (admin-gestion-pago): notes under the Acción de pago copy, before the form; the outlet comes with that page. Input: reservation. */
export const PAYMENT_MANAGEMENT_NOTES: PortalSlotToken = new InjectionToken('PAYMENT_MANAGEMENT_NOTES');
/** 13 (admin-pagos): page panels, such as "Devoluciones monetarias"; the outlet comes with that page. */
export const PAYMENTS_PAGE_PANELS: PortalSlotToken = new InjectionToken('PAYMENTS_PAGE_PANELS');
/** 13 (admin-pagos): actions of each payments row; the outlet comes with that page. */
export const PAYMENTS_ROW_ACTIONS: PortalSlotToken = new InjectionToken('PAYMENTS_ROW_ACTIONS');
/** 13 (admin-pagos): row groups of "Pagos pendientes" after the page's own, each a tbody of its story; the outlet comes with that page. */
export const PAYMENTS_TABLE_BODIES: PortalSlotToken = new InjectionToken('PAYMENTS_TABLE_BODIES');
/** admin-notificaciones.html, frame of HU-COM-016 (DP-RF6): the items of "Alertas del tenant"; the area exists only while one is available. */
export const OPERATOR_NOTIFICATIONS: PortalSlotToken = new InjectionToken('OPERATOR_NOTIFICATIONS');
/** 17 (panel-cliente): items of "Acciones rápidas" after its own; a contribution's selector names an li. */
export const CLIENT_QUICK_ACTIONS: PortalSlotToken = new InjectionToken('CLIENT_QUICK_ACTIONS');
/** 17 (panel-cliente): the "Notificaciones" section, drawn only when a notice is available. */
export const CLIENT_NOTICES: PortalSlotToken = new InjectionToken('CLIENT_NOTICES');
/** Mis reservas: lines of each reservation card under the departure line. Input: reservationId. */
export const RESERVATION_CARD_EXTRAS: PortalSlotToken = new InjectionToken('RESERVATION_CARD_EXTRAS');
/** 10A: header actions before "Volver a reservas", such as "Cancelar o modificar reserva". Input: reservation. */
export const RESERVATION_DETAIL_ACTIONS: PortalSlotToken = new InjectionToken('RESERVATION_DETAIL_ACTIONS');
/** Mis reservas: actions closing each reservation card, such as "Responder propuesta". Input: reservationId. */
export const RESERVATION_CARD_ACTIONS: PortalSlotToken = new InjectionToken('RESERVATION_CARD_ACTIONS');
/** Treatment sub-screen of 13 (admin-tratamiento-pendiente-devolucion), owned by HU-COM-016: actions after "Registrar devolución del 100 %".
 * Inputs: reservationId, decided (the refund or its default closed it), changed (called after a contribution records a decision). */
export const REFUND_TREATMENT_ACTIONS: PortalSlotToken = new InjectionToken('REFUND_TREATMENT_ACTIONS');

/** The available contributions of a slot, by order. */
export function slotEntries(slot: PortalSlotToken, injector: Injector): readonly Type<unknown>[] {
  return [...(injector.get(slot, null, { optional: true }) ?? [])].filter((entry) => entry.isAvailable?.(injector) ?? true)
    .sort((a, b) => a.order - b.order).map((entry) => entry.component);
}

/** `<ng-container *crpSlot="TOKEN; inputs: {...}" />`: draws the contributions, without a host element, and nothing when there are none. */
@Directive({ selector: '[crpSlot]' })
export class PortalSlotOutlet implements OnChanges {
  readonly crpSlot = input.required<PortalSlotToken>();
  readonly crpSlotInputs = input<Readonly<Record<string, unknown>>>({});
  private readonly view = inject(ViewContainerRef);
  private readonly injector = inject(Injector);
  private refs: ComponentRef<unknown>[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['crpSlot']) {
      this.view.clear();
      this.refs = slotEntries(this.crpSlot(), this.injector).map((component) => this.view.createComponent(component, { injector: this.injector }));
    }
    const values = this.crpSlotInputs();
    for (const ref of this.refs) {
      const declared = reflectComponentType(ref.componentType)?.inputs.map((field) => field.templateName) ?? [];
      for (const name of declared) { if (name in values) ref.setInput(name, values[name]); }
    }
  }
}
