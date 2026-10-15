import { Provider } from '@angular/core';
import { Observable, map, of, take, tap } from 'rxjs';
import { CatalogItemsSource } from '../catalog/data/catalog-api.service';
import { CustomersSource } from '../customers/data/customers-source';
import { CustomersWriter } from '../customers/data/customers-writer';
import { CustomerGroup, CustomerMatch, LeadCommand, Person, PersonCommand } from '../customers/model/customer-group';
import type { LeadFields } from '../customers/model/party-rules';

// DEMO (spec DD-1): invented people only (RN-PC9). Debt: replace with sources over props.apiClient when G-B is closed.
const extra = (bloodType: string, physicalRestrictions: string) =>
  ({ informedConsent: true, bloodType, emergencyContact: 'Contacto Demo 000-0000', physicalRestrictions });

/** The three customers of the first draft of 10B, now the seeds of the one directory behind the search (amendment V19-D1). */
export const DEMO_CUSTOMERS: readonly CustomerMatch[] = [
  { id: 'demo-cus-1', fullName: 'Camila Ortega (demo)', document: 'DEMO-1001', email: 'camila.ortega@example.test', phone: '300 000 1001', birthDate: '1990-03-14', verified: true },
  { id: 'demo-cus-2', fullName: 'Andrés Pinto (demo)', document: 'DEMO-1002', email: 'andres.pinto@example.test', phone: '300 000 1002', birthDate: '1987-11-02', verified: true },
  { id: 'demo-cus-3', fullName: 'Laura Gómez (demo)', document: 'DEMO-1003', email: 'laura.gomez@example.test', phone: '300 000 1003', birthDate: '1994-06-25', verified: false },
];
/** Dots, spaces and case do not make a document different (RN-RES-005). */
const documentKey = (text: string) => text.replace(/[^0-9a-z]/gi, '').toLowerCase();

export class DemoCustomersStore extends CustomersSource {
  private readonly directory: CustomerMatch[] = [...DEMO_CUSTOMERS];
  private sequence = DEMO_CUSTOMERS.length;
  group: CustomerGroup | null = {
    groupId: 'demo-group-0', serviceId: 'demo-svc-3', activityName: 'Canotaje en el Río Suaza', highRisk: true,
    lead: { personId: 'demo-person-a', fullName: 'Lucía Demo Ficticia', document: 'DEMO-0001', email: 'lucia.demo@example.test', contact: '300 000 0001',
      birthDate: '1991-04-12', acceptedTerms: true, highRisk: extra('O+', 'Ninguna') },
    companions: [{ personId: 'demo-person-b', fullName: 'Mateo Demo Ficticio', document: 'DEMO-0002', contact: '300 000 0002',
      birthDate: '2012-08-30', highRisk: extra('A-', 'Usa lentes') }],
  };
  override current(): Observable<CustomerGroup | null> { return of(this.group); }
  /** Name, e-mail or document (without dots or spaces), as the mockup searches. */
  override search(text: string): Observable<readonly CustomerMatch[]> {
    const query = text.trim().toLowerCase(), document = documentKey(query);
    return of(this.directory.filter((c) => c.fullName.toLowerCase().includes(query) || c.email.toLowerCase().includes(query) || (!!document && documentKey(c.document).includes(document))));
  }
  /** A titular typed by hand is registered with the reservation (A.2 row 2); the same document is the same customer. */
  register(lead: LeadFields): string {
    const known = this.directory.find((c) => documentKey(c.document) === documentKey(lead.document));
    if (known) return known.id;
    const created: CustomerMatch = { id: `demo-cus-${++this.sequence}`, ...lead, verified: false };
    this.directory.push(created);
    return created.id;
  }
  all(): readonly CustomerMatch[] { return this.directory; }
  nameOf(id: string): string | undefined { return this.directory.find((c) => c.id === id)?.fullName; }
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

export function customersDemoProviders(): Provider[] {
  const store = new DemoCustomersStore();
  let writer: DemoCustomersWriter | undefined;
  return [
    { provide: CustomersSource, useValue: store },
    { provide: CustomersWriter, useFactory: (catalog: CatalogItemsSource) => (writer ??= new DemoCustomersWriter(store, catalog)), deps: [CatalogItemsSource] },
  ];
}
