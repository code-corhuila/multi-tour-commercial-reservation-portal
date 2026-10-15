import { CUSTOMERS_COPY } from '../customers-copy';
import { EMAIL } from './customer-group';

/** The titular typed in section 01 of 10B (HU-COM-005 amendment A.2 row 2): sent with the reservation when no existing customer was chosen. */
export type LeadFields = { fullName: string; document: string; email: string; phone: string; birthDate: string };
export type CompanionFields = { fullName: string; document: string; birthDate: string };
export const BLANK_LEAD: LeadFields = { fullName: '', document: '', email: '', phone: '', birthDate: '' };
export const BLANK_COMPANION: CompanionFields = { fullName: '', document: '', birthDate: '' };
export type PartyMessages = { lead: Partial<Record<keyof LeadFields, string>>; companions: Partial<Record<keyof CompanionFields, string>>[] };

const blank = (value: string) => !value.trim();
const normalized = (document: string) => document.replace(/[\s.]+/g, '').toLowerCase();

/** dd/mm/aaaa (as the person types it) to ISO, or null when it is not a real calendar date; the future is not judged here (AC-PC.13). */
export function birthToIso(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const date = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return date.getUTCFullYear() === +m[3] && date.getUTCMonth() === +m[2] - 1 && date.getUTCDate() === +m[1] ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
export const isoToBirth = (iso: string): string => iso.split('-').reverse().join('/');

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
  if (!messages.lead.birthDate && !birthToIso(lead.birthDate)) messages.lead.birthDate = CUSTOMERS_COPY.invalidDate;
  companions.forEach((c, i) => { for (const field of Object.keys(BLANK_COMPANION) as (keyof CompanionFields)[]) if (blank(c[field])) messages.companions[i][field] = CUSTOMERS_COPY.required; if (!messages.companions[i].birthDate && !birthToIso(c.birthDate)) messages.companions[i].birthDate = CUSTOMERS_COPY.invalidDate; });
  return messages;
}

export const hasMessages = (messages: PartyMessages): boolean =>
  Object.keys(messages.lead).length > 0 || messages.companions.some((c) => Object.keys(c).length > 0);
