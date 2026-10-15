import { Observable, Subject, of } from 'rxjs';
import { CustomersSource, SensitiveDataAccess } from '../src/app/customers/data/customers-source';
import { CustomersWriter } from '../src/app/customers/data/customers-writer';
import { CustomerGroup, LeadCommand, Person, PersonCommand } from '../src/app/customers/model/customer-group';

/** A source that never answers on its own: the test decides when and how. */
export class ControllableCustomersSource extends CustomersSource {
  override search() { return of([]); }
  readonly requests: { reply: (group: CustomerGroup | null) => void; fail: () => void }[] = [];
  override current(): Observable<CustomerGroup | null> {
    return new Observable((subscriber) => {
      this.requests.push({ reply: (group) => { subscriber.next(group); subscriber.complete(); },
        fail: () => subscriber.error(new Error('unavailable')) });
    });
  }
}

export interface CustomersCall {
  readonly kind: 'lead' | 'companion';
  readonly groupId: string | null;
  readonly command: LeadCommand | PersonCommand;
  readonly key: string;
  readonly reply: (group: CustomerGroup) => void;
  readonly fail: (error: unknown) => void;
}

/** A writer that records every call and answers when the test says. */
export class ControllableCustomersWriter extends CustomersWriter {
  readonly calls: CustomersCall[] = [];
  private open(kind: CustomersCall['kind'], groupId: string | null, command: LeadCommand | PersonCommand, key: string) {
    const answers = new Subject<CustomerGroup>();
    this.calls.push({ kind, groupId, command, key, reply: (g) => { answers.next(g); answers.complete(); }, fail: (e) => answers.error(e) });
    return answers.asObservable();
  }
  override registerLead(command: LeadCommand, key: string) { return this.open('lead', null, command, key); }
  override addCompanion(groupId: string, command: PersonCommand, key: string) { return this.open('companion', groupId, command, key); }
}

export function sensitiveAccess(granted: boolean): SensitiveDataAccess {
  return new (class extends SensitiveDataAccess { override readonly granted = granted; })();
}

/** Invented people only (RN-PC9). */
export function personNamed(fullName: string, document: string, withHighRisk = true): Person {
  return {
    personId: `p-${document}`, fullName, document, email: `${document.replace(/\s+/g, '').toLowerCase()}@example.test`, contact: '300 000 0000', birthDate: '1990-05-01',
    ...(withHighRisk ? { highRisk: { informedConsent: true, bloodType: 'AB-', emergencyContact: 'Contacto Ficticio 300', physicalRestrictions: 'Asma leve' } } : {}),
  };
}

export function groupWith(highRisk = true, companions: Person[] = []): CustomerGroup {
  return { groupId: 'g-1', serviceId: 'svc-1', activityName: 'Canotaje de prueba', highRisk,
    lead: personNamed('Lider Ficticio Uno', 'DOC 1001', highRisk), companions };
}
