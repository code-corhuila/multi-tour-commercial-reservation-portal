import { CUSTOMER_COMPANIONS_COPY as COPY } from './customer-companions-copy';

/** A companion of the customer screens 21 and 25: the five fields of the mockup; the phone is the only optional one. Birth date is ISO (yyyy-mm-dd). */
export interface CustomerCompanion { readonly fullName: string; readonly document: string; readonly birthDate: string; readonly phone: string; readonly emergency: string }
export const BLANK_CUSTOMER_COMPANION: CustomerCompanion = { fullName: '', document: '', birthDate: '', phone: '', emergency: '' };

export interface CompanionIssues {
  /** The one sentence the screen shows, in the order of the mockup: a missing datum, a future birth date, a repeated document; null when all is right. */
  readonly message: string | null;
  /** Beside the document field of each companion whose document repeats another one of the reservation. */
  readonly documents: readonly (string | undefined)[];
}

const blank = (value: string) => !value.trim();
/** The rule of the mockup (`normalizeDoc`): only letters and digits count, so spaces, dots, dashes and case do not make a document different (RN-RES-005). */
const normalizedDocument = (document: string): string => document.toLowerCase().replace(/[^a-z0-9]/g, '');

/** AC-PC.13 and AC-PC.14: `today` is the tenant's day (shared clock); `holderDocument` may be empty while the titular has not typed it. */
export function companionIssues(companions: readonly CustomerCompanion[], holderDocument: string, today: string): CompanionIssues {
  const keys = [holderDocument, ...companions.map((c) => c.document)].map(normalizedDocument);
  const documents = companions.map((_, i) => (keys[i + 1] && keys.some((other, j) => j !== i + 1 && other === keys[i + 1]) ? COPY.repeatedBeside : undefined));
  const missing = companions.findIndex((c) => blank(c.fullName) || blank(c.document) || blank(c.birthDate) || blank(c.emergency));
  const future = companions.findIndex((c) => c.birthDate > today);
  const message = missing !== -1 ? COPY.missing(missing + 1) : future !== -1 ? COPY.future(future + 1) : documents.some(Boolean) ? COPY.repeated : null;
  return { message, documents };
}

/** `25 años`; nothing for an empty or future date. */
export function ageText(birthDate: string, today: string): string {
  if (!birthDate || birthDate > today) return '';
  const [by, bm, bd] = birthDate.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
  return COPY.years(ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0));
}

/** The companions a reservation of `people` travelers asks for: everyone but the titular. */
export const companionsFor = (people: number): number => Math.max(0, people - 1);

/** The list padded with blank companions to `count`, so a screen always holds one entry per companion required. */
export const paddedCompanions = (list: readonly CustomerCompanion[], count: number): readonly CustomerCompanion[] =>
  Array.from({ length: count }, (_, i) => list[i] ?? BLANK_CUSTOMER_COMPANION);

export function withCompanionField(list: readonly CustomerCompanion[], count: number, index: number, field: keyof CustomerCompanion, value: string): readonly CustomerCompanion[] {
  return paddedCompanions(list, count).map((c, i) => (i === index ? { ...c, [field]: value } : c));
}
