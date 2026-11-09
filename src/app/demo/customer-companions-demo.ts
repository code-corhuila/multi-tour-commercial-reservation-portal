import { Provider } from '@angular/core';
import { PORTAL_AREAS, PORTAL_AREA_LIST, PortalArea } from '../portal-areas';
import { CustomerContext } from '../self-service-reservation/data/customer-context';
import { Observable, of } from 'rxjs';
import { COMPANIONS_AREA, CompanionsRecord, CustomerCompanionsSource, CustomerCompanionsWriter } from '../customers/data/customer-companions-ports';
import { CustomerCompanionsPageComponent } from '../customers/pages/customer-companions-page.component';
import { CustomerCompanion } from '../shared/customer-companions';
import { DEMO_CUSTOMERS } from './customers-demo';
import { DEMO_FINAL_CUSTOMER } from './self-service-reservation-demo';

// DEMO (spec DD-1, decision D-7): the companions of screen 25 live in memory; invented people only (RN-PC9). Debt: the contract has no operation yet (gap G-B).
const HOLDER_DOCUMENT = DEMO_CUSTOMERS.find((c) => c.id === DEMO_FINAL_CUSTOMER)?.document ?? '';

export class DemoCustomerCompanions extends CustomerCompanionsSource {
  readonly saved = new Map<string, readonly CustomerCompanion[]>();
  override load(reservationId: string): Observable<CompanionsRecord> { return of({ holderDocument: HOLDER_DOCUMENT, companions: this.saved.get(reservationId) ?? [] }); }
}

/** Answers a repeated Idempotency-Key without saving twice (Annex H). */
export class DemoCustomerCompanionsWriter extends CustomerCompanionsWriter {
  private readonly answered = new Set<string>();
  constructor(private readonly store: DemoCustomerCompanions) { super(); }
  override save(reservationId: string, companions: readonly CustomerCompanion[], key: string): Observable<void> {
    if (!this.answered.has(key)) { this.answered.add(key); this.store.saved.set(reservationId, companions); }
    return of(undefined);
  }
}

/**
 * acompanantes.html (25), customer variant: opened with { reservation }; no entrance is drawn (spec DP-005-V19-5). It is registered here, with
 * the ports it needs, because the contract has no operation for it yet (D-7): the real registry gains the entry when an adapter exists.
 */
const COMPANIONS_AREA_ENTRY: PortalArea = { key: COMPANIONS_AREA, label: 'Datos de acompañantes', component: CustomerCompanionsPageComponent, audience: 'customer', clientChrome: 'none', menu: false,
  isAvailable: (injector) => injector.get(CustomerContext).standing !== 'OTHER' };

export function customerCompanionsDemoProviders(): Provider[] {
  const store = new DemoCustomerCompanions();
  return [{ provide: CustomerCompanionsSource, useValue: store }, { provide: CustomerCompanionsWriter, useValue: new DemoCustomerCompanionsWriter(store) },
    { provide: PORTAL_AREA_LIST, useFactory: () => [...PORTAL_AREAS, COMPANIONS_AREA_ENTRY] }];
}
