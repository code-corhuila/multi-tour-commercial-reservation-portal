import { Observable, map, of } from 'rxjs';
import { CustomersSource } from '../customers/data/customers-source';
import { CustomersWriter } from '../customers/data/customers-writer';
import { CustomerGroup, CustomerMatch, LeadCommand, PersonCommand } from '../customers/model/customer-group';
import { PortalApiClient } from '../shell-contract';
import { API_BASE, call, notInContract } from './api-paths';

/** Customers over the container client (openapi: POST /customers, PROPOSED field names; G-A). Sensitive data is sent, never returned, logged or kept. */
const MIN_SEARCH = 2;
export const customersPath = (customerId?: string): string => [`${API_BASE}/customers`, customerId].filter(Boolean).join('/');

/** CustomerResponse of the contract: ordinary data only. */
interface CustomerDto {
  readonly customerId: string; readonly fullName: string; readonly documentNumber: string; readonly birthDate?: string;
  readonly contact: { readonly email: string; readonly phone: string }; readonly termsAccepted: boolean; readonly highRisk: boolean;
}

function bodyFromCommand(command: LeadCommand): Record<string, unknown> {
  const risk = command.highRisk;
  return {
    fullName: command.fullName, documentNumber: command.document, birthDate: command.birthDate,
    contact: { email: command.email ?? '', phone: command.contact }, termsAccepted: command.acceptedTerms ?? false, serviceId: command.serviceId,
    ...(risk ? { informedConsentSigned: risk.informedConsent, emergencyInfo: { bloodType: risk.bloodType, emergencyContact: risk.emergencyContact, mobilityRestrictions: risk.physicalRestrictions } } : {}),
  };
}

/** TODO(G-B): the answer has no activity name (it reads empty) and the contract has no group, so the customer is the group and has no companions. */
function groupFromDto(dto: CustomerDto, command: LeadCommand): CustomerGroup {
  return { groupId: dto.customerId, serviceId: command.serviceId, activityName: '', highRisk: dto.highRisk, companions: [],
    lead: { personId: dto.customerId, fullName: dto.fullName, document: dto.documentNumber, email: dto.contact.email, contact: dto.contact.phone, birthDate: dto.birthDate ?? '', acceptedTerms: dto.termsAccepted } };
}

export class CustomersApiSource extends CustomersSource {
  constructor(private readonly _client: PortalApiClient) { super(); }
  /** TODO(G-B): the draft group belongs to the reservation (HU-COM-007); the contract has no read of it. */
  override current(): Observable<CustomerGroup | null> { return notInContract('El servicio aún no publica el grupo de personas de la reserva.'); }
  /** GET /customers?search= (PROPOSED, api spec 005 F-18 amended): by the start of the name, first page, ordinary data. Document and e-mail are not searched yet (DP-D5-2, DP-D5-3); the service sends no verified-e-mail mark, so a match reads as not verified. */
  override search(text: string): Observable<readonly CustomerMatch[]> {
    const term = text.trim();
    if (term.length < MIN_SEARCH) return of([]);
    return call<{ readonly data: readonly CustomerDto[] }>(this._client, `${customersPath()}?${new URLSearchParams({ search: term })}`).pipe(
      map((page) => page.data.map((dto): CustomerMatch => ({ id: dto.customerId, fullName: dto.fullName, document: dto.documentNumber, email: dto.contact.email,
        phone: dto.contact.phone, birthDate: dto.birthDate ?? '', verified: false }))));
  }
}

export class CustomersApiWriter extends CustomersWriter {
  constructor(private readonly client: PortalApiClient) { super(); }
  override registerLead(command: LeadCommand, idempotencyKey: string): Observable<CustomerGroup> {
    return call<CustomerDto>(this.client, customersPath(), { method: 'POST', body: bodyFromCommand(command), headers: { 'Idempotency-Key': idempotencyKey } })
      .pipe(map((dto) => groupFromDto(dto, command)));
  }
  /** Companions belong to the reservation (HU-COM-007); the customer contract has no operation for them. */
  override addCompanion(_groupId: string, _command: PersonCommand, _idempotencyKey: string): Observable<CustomerGroup> {
    return notInContract('El servicio aún no publica el registro de acompañantes.');
  }
}
