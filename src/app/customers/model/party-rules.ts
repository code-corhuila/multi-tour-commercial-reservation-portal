import { CUSTOMERS_COPY } from '../customers-copy';
import { EMAIL } from './customer-group';

/** The titular typed in section 01 of 10B (HU-COM-005 amendment A.2 row 2): sent with the reservation when no existing customer was chosen. */
export type LeadFields = { fullName: string; document: string; email: string; phone: string; birthDate: string };
/** One companion of section 03: the three fields of the operator mockup (A.2 row 3). */
export type CompanionFields = { fullName: string; document: string; birthDate: string };
export const BLANK_LEAD: LeadFields = { fullName: '', document: '', email: '', phone: '', birthDate: '' };
export const BLANK_COMPANION: CompanionFields = { fullName: '', document: '', birthDate: '' };
export type PartyMessages = { lead: Partial<Record<keyof LeadFields, string>>; companions: Partial<Record<keyof CompanionFields, string>>[] };

const blank = (value: string) => !value.trim();
/** RN-RES-005: spaces, dots and case do not make a document different. */
const normalized = (document: string) => document.replace(/[\s.]+/g, '').toLowerCase();

/** The companions asked for by the number of travelers: one fewer than the people, never negative. */
export const companionsRequired = (travelers: number): number => Math.max(0, travelers - 1);

/** Every refusal beside its field. `duplicates` is true when only the repeated documents are wanted (they show before the submit). */
export function partyMessages(lead: LeadFields, companions: readonly CompanionFields[], duplicatesOnly = false): PartyMessages {
  const messages: PartyMessages = { lead: {}, companions: companions.map(() => ({})) };
  const documents = [lead.document, ...companions.map((c) => c.document)];
  const repeated = (index: number) => !blank(documents[index]) && documents.some((other, i) => i !== index && normalized(other) === normalized(documents[index]));
  if (repeated(0)) messages.lead.document = CUSTOMERS_COPY.duplicate;
  companions.forEach((_, i) => { if (repeated(i + 1)) messages.companions[i].document = CUSTOMERS_COPY.duplicate; });
  if (duplicatesOnly) return messages;
  for (const field of Object.keys(BLANK_LEAD) as (keyof LeadFields)[]) if (blank(lead[field])) messages.lead[field] = CUSTOMERS_COPY.required;
  if (!messages.lead.email && !EMAIL.test(lead.email.trim())) messages.lead.email = CUSTOMERS_COPY.invalidEmail;
  companions.forEach((c, i) => { for (const field of Object.keys(BLANK_COMPANION) as (keyof CompanionFields)[]) if (blank(c[field])) messages.companions[i][field] = CUSTOMERS_COPY.required; });
  return messages;
}

export const hasMessages = (messages: PartyMessages): boolean =>
  Object.keys(messages.lead).length > 0 || messages.companions.some((c) => Object.keys(c).length > 0);
