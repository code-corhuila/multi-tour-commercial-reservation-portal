import { ActorRole } from '../../catalog/model/catalog-item';

/** PROPUESTO (spec DP-PC2): the list of blood types is not decided in 06-data yet. */
export const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const;

/** The extra data of a high-risk activity (RN-CLI-002, RN-CLI-003). Sensitive: shown only with the permission. */
export interface HighRiskData { readonly informedConsent: boolean; readonly bloodType: string; readonly emergencyContact: string; readonly physicalRestrictions: string }
export interface PersonCommand {
  readonly fullName: string; readonly document: string; readonly contact: string; readonly birthDate: string;
  readonly acceptedTerms?: boolean; readonly highRisk?: HighRiskData;
}
export interface LeadCommand extends PersonCommand { readonly serviceId: string; }
export interface Person extends PersonCommand { readonly personId: string; }

/** The lead and companions being prepared for one reservation; HU-COM-007 attaches it (plan D-03). */
export interface CustomerGroup {
  readonly groupId: string; readonly serviceId: string; readonly activityName: string; readonly highRisk: boolean;
  readonly lead: Person; readonly companions: readonly Person[];
}

/** A customer found by the search of 10B (HU-COM-005 amendment A.2 row 2): the five fields of the titular and whether the e-mail is verified. */
export interface CustomerMatch {
  readonly id: string; readonly fullName: string; readonly document: string; readonly email: string; readonly phone: string;
  readonly birthDate: string; readonly verified: boolean;
}

export const HIGH_RISK_FIELDS = ['informedConsent', 'bloodType', 'emergencyContact', 'physicalRestrictions'] as const;
export type HighRiskField = (typeof HIGH_RISK_FIELDS)[number];
export const PERSON_FIELDS = ['fullName', 'document', 'contact', 'birthDate'] as const;
export type PersonField = 'serviceId' | 'acceptedTerms' | (typeof PERSON_FIELDS)[number] | HighRiskField;
/** What the form holds: text, with a checkbox as 'true' or ''. */
export type PersonDraft = Partial<Record<PersonField, string>>;
export type PersonMessages = Partial<Record<PersonField, string>>;
export type PersonKind = 'lead' | 'companion';

const blank = (value: string | undefined) => !value?.trim();
const normalized = (document: string) => document.replace(/\s+/g, '').toLowerCase();
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The extra fields missing for a high-risk activity; none when the activity is ordinary. */
export function missingHighRiskData(draft: PersonDraft, highRisk: boolean): HighRiskField[] {
  if (!highRisk) return [];
  return HIGH_RISK_FIELDS.filter((field) => (field === 'informedConsent' ? draft[field] !== 'true' : blank(draft[field])));
}

/** RN-RES-005: one document per group, lead included; spaces and case do not make it different. */
export function duplicateDocument(group: CustomerGroup | null, document: string): boolean {
  return !!group && [group.lead, ...group.companions].some((person) => normalized(person.document) === normalized(document));
}

/** Every refusal of the draft, keyed by the field it belongs beside. */
export function validatePerson(draft: PersonDraft, kind: PersonKind, highRisk: boolean, group: CustomerGroup | null): PersonMessages {
  const messages: PersonMessages = {};
  const required: PersonField[] = kind === 'lead' ? ['serviceId', ...PERSON_FIELDS] : [...PERSON_FIELDS];
  for (const field of required) if (blank(draft[field])) messages[field] = 'Required.';
  if (kind === 'lead' && draft.acceptedTerms !== 'true') messages.acceptedTerms = 'The terms must be accepted.';
  if (!messages.document && duplicateDocument(group, draft.document ?? '')) messages.document = 'This document is already in the group.';
  for (const field of missingHighRiskData(draft, highRisk)) messages[field] = 'Required for a high-risk activity.';
  return messages;
}

/** What the writer receives; the extra data travels only for a high-risk activity. */
export function personCommand(draft: PersonDraft, kind: PersonKind, highRisk: boolean): PersonCommand | LeadCommand {
  const text = (field: PersonField) => (draft[field] ?? '').trim();
  return {
    ...(kind === 'lead' ? { serviceId: text('serviceId'), acceptedTerms: true } : {}),
    fullName: text('fullName'), document: text('document'), contact: text('contact'), birthDate: text('birthDate'),
    ...(highRisk ? { highRisk: { informedConsent: true, bloodType: text('bloodType'), emergencyContact: text('emergencyContact'), physicalRestrictions: text('physicalRestrictions') } } : {}),
  };
}

export interface CustomersCapabilities { readonly canRead: boolean; readonly canRegister: boolean; readonly isDenied: boolean; }

/** Plan D-07: Administrator and Collaborator register; Manager, Analyst and READ_ONLY read; anything else denied. */
export function customersCapabilitiesOf(role: ActorRole): CustomersCapabilities {
  const canRegister = role === 'TENANT_ADMINISTRATOR' || role === 'OPERATIONAL_COLLABORATOR';
  const canRead = canRegister || role === 'MANAGER' || role === 'ANALYST' || role === 'READ_ONLY';
  return { canRead, canRegister, isDenied: !canRead };
}

/** Plan D-06: the permission, never the profile; Manager, Analyst and Accountant are masked even with a grant. */
export function canViewSensitiveData(role: ActorRole, granted: boolean): boolean {
  return granted && (role === 'TENANT_ADMINISTRATOR' || role === 'OPERATIONAL_COLLABORATOR');
}
