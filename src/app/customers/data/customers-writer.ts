import { Observable } from 'rxjs';
import { CustomerGroup, LeadCommand, PersonCommand } from '../model/customer-group';

/** Each registration carries its Idempotency-Key, reused while the same intention is retried (plan D-02). */
export abstract class CustomersWriter {
  abstract registerLead(command: LeadCommand, idempotencyKey: string): Observable<CustomerGroup>;
  abstract addCompanion(groupId: string, command: PersonCommand, idempotencyKey: string): Observable<CustomerGroup>;
}
