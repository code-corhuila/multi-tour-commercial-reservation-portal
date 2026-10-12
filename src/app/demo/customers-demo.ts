import { Provider } from '@angular/core';
import { Observable, map, of, take, tap } from 'rxjs';
import { CatalogItemsSource } from '../catalog/data/catalog-api.service';
import { CustomersSource, SensitiveDataAccess } from '../customers/data/customers-source';
import { CustomersWriter } from '../customers/data/customers-writer';
import { CustomerGroup, LeadCommand, Person, PersonCommand } from '../customers/model/customer-group';

// DEMO (spec DD-1): invented people only (RN-PC9). Debt: replace with sources over props.apiClient when G-B is closed.
/** PROPUESTO (spec DP-PC1): how the container would report "Consultar datos sensibles" is not decided. */
export const SENSITIVE_DATA_PERMISSION = 'CONSULT_SENSITIVE_DATA';
const extra = (bloodType: string, physicalRestrictions: string) =>
  ({ informedConsent: true, bloodType, emergencyContact: 'Contacto Demo 000-0000', physicalRestrictions });

export class DemoCustomersStore extends CustomersSource {
  group: CustomerGroup | null = {
    groupId: 'demo-group-0', serviceId: 'demo-svc-3', activityName: 'Canotaje en el Rio Suaza', highRisk: true,
    lead: { personId: 'demo-person-a', fullName: 'Lucia Demo Ficticia', document: 'DEMO-0001', contact: 'lucia.demo@example.test',
      birthDate: '1991-04-12', acceptedTerms: true, highRisk: extra('O+', 'Ninguna') },
    companions: [{ personId: 'demo-person-b', fullName: 'Mateo Demo Ficticio', document: 'DEMO-0002', contact: 'mateo.demo@example.test',
      birthDate: '2012-08-30', highRisk: extra('A-', 'Usa lentes') }],
  };
  override current(): Observable<CustomerGroup | null> { return of(this.group); }
}

/** Answers a repeated Idempotency-Key with the first result, as the service will (AC-PC.8). */
export class DemoCustomersWriter extends CustomersWriter {
  private sequence = 0;
  private readonly answered = new Map<string, CustomerGroup>();
  constructor(private readonly store: DemoCustomersStore, private readonly catalog: CatalogItemsSource) { super(); }
  override registerLead(command: LeadCommand, key: string): Observable<CustomerGroup> {
    return this.once(key, () => this.catalog.list().pipe(map((items) => {
      const activity = items.find((item) => item.serviceId === command.serviceId);
      return { groupId: `demo-group-${++this.sequence}`, serviceId: command.serviceId, activityName: activity?.commercialName ?? command.serviceId,
        highRisk: !!activity?.highRisk, lead: this.person(command), companions: [] };
    })));
  }
  override addCompanion(_groupId: string, command: PersonCommand, key: string): Observable<CustomerGroup> {
    return this.once(key, () => of({ ...this.store.group!, companions: [...this.store.group!.companions, this.person(command)] }));
  }
  private person(command: PersonCommand): Person {
    const { serviceId: _ignored, ...person } = command as LeadCommand;
    return { ...person, personId: `demo-person-${++this.sequence}` };
  }
  private once(key: string, make: () => Observable<CustomerGroup>): Observable<CustomerGroup> {
    const known = this.answered.get(key);
    return known ? of(known) : make().pipe(take(1), tap((group) => { this.answered.set(key, group); this.store.group = group; }));
  }
}

export function demoSensitiveDataAccess(roles: readonly string[]): SensitiveDataAccess {
  return new (class extends SensitiveDataAccess { override readonly granted = roles.includes(SENSITIVE_DATA_PERMISSION); })();
}

export function customersDemoProviders(roles: readonly string[]): Provider[] {
  const store = new DemoCustomersStore();
  return [
    { provide: CustomersSource, useValue: store },
    { provide: CustomersWriter, useFactory: (catalog: CatalogItemsSource) => new DemoCustomersWriter(store, catalog), deps: [CatalogItemsSource] },
    { provide: SensitiveDataAccess, useValue: demoSensitiveDataAccess(roles) },
  ];
}
