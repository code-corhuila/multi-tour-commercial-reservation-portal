import { Observable, map, throwError } from 'rxjs';
import { CustomersSource } from '../customers/data/customers-source';
import { CustomersWriter } from '../customers/data/customers-writer';
import { CustomerGroup, CustomerMatch, LeadCommand, PersonCommand } from '../customers/model/customer-group';
import { ApiError, PortalApiClient } from '../shell-contract';
import { API_BASE, call } from './api-paths';

/** Customers over the container client (openapi: POST /customers, PROPOSED field names; G-A). Sensitive data is sent, never returned, logged or kept. */
export const customersPath = (customerId?: string): string => [`${API_BASE}/customers`, customerId].filter(Boolean).join('/');

/** CustomerResponse of the contract: ordinary data only. */
interface CustomerDto {
  readonly customerId: string; readonly fullName: string; readonly documentNumber: string; readonly birthDate?: string;
  readonly contact: { readonly email: string; readonly phone: string }; readonly termsAccepted: boolean; readonly highRisk: boolean;
}

const notInContract = (what: string): Observable<never> => throwError((): ApiError => ({ status: 0, code: 'NOT_IN_CONTRACT', message: what, details: [], traceId: '', userMessage: what }));

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
  /** TODO(G-B): the contract has no customer search; it reads a customer by id only. */
  override search(_text: string): Observable<readonly CustomerMatch[]> { return notInContract('El servicio aún no publica la búsqueda de clientes.'); }
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
