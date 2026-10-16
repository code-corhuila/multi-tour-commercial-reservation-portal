import { Injectable, computed, signal } from '@angular/core';
import { CustomerMatch } from '../model/customer-group';
import { BLANK_COMPANION, BLANK_LEAD, CompanionFields, LeadFields, PartyMessages, birthToIso, companionsRequired, hasMessages, isoToBirth, partyMessages } from '../model/party-rules';

export type PartyCommand = { leadCustomerId?: string; lead?: LeadFields; companions: readonly CompanionFields[] };

/**
 * The people of one reservation being prepared in 10B. The form of HU-COM-007 provides it and sets `travelers`; the sections that
 * HU-COM-005 contributes to RESERVATION_FORM_SECTIONS write the titular and the companions; the form reads `command()` and `valid()`.
 * Neither side imports the other's components (pillar 10).
 */
@Injectable()
export class ReservationParty {
  readonly travelers = signal(0);
  readonly picked = signal<CustomerMatch | null>(null);
  readonly lead = signal<LeadFields>(BLANK_LEAD);
  private readonly typed = signal<readonly CompanionFields[]>([]);
  /** True after the first submit: the missing data show beside their field (a repeated document shows at once). */
  readonly attempted = signal(false);
  /** Counts the submits the form refused: the sections focus their first field in error (pillar 7). */
  readonly rejected = signal(0);
  readonly required = computed(() => companionsRequired(this.travelers()));
  readonly companions = computed(() => Array.from({ length: this.required() }, (_, i) => this.typed()[i] ?? BLANK_COMPANION));
  private readonly all = computed<PartyMessages>(() => partyMessages(this.lead(), this.companions()));
  readonly valid = computed(() => !hasMessages(this.all()));
  readonly shown = computed<PartyMessages>(() => (this.attempted() ? this.all() : partyMessages(this.lead(), this.companions(), true)));

  choose(customer: CustomerMatch | null): void {
    this.picked.set(customer);
    if (customer) this.lead.set({ fullName: customer.fullName, document: customer.document, email: customer.email, phone: customer.phone, birthDate: isoToBirth(customer.birthDate) });
  }
  setLead(field: keyof LeadFields, value: string): void {
    const picked = this.picked();
    if (picked && field === 'email' && value.trim().toLowerCase() !== picked.email.trim().toLowerCase()) this.picked.set(null);
    this.lead.update((lead) => ({ ...lead, [field]: value }));
  }
  setCompanion(index: number, field: keyof CompanionFields, value: string): void {
    const next = [...this.typed()];
    while (next.length <= index) next.push(BLANK_COMPANION);
    next[index] = { ...next[index], [field]: value };
    this.typed.set(next);
  }
  command(): PartyCommand {
    const picked = this.picked();
    const lead = this.lead();
    return { ...(picked ? { leadCustomerId: picked.id } : { lead: { ...(Object.fromEntries(Object.entries(lead).map(([k, v]) => [k, v.trim()])) as LeadFields), birthDate: birthToIso(lead.birthDate) ?? '' } }),
      companions: this.companions().map((c) => ({ fullName: c.fullName.trim(), document: c.document.trim(), birthDate: birthToIso(c.birthDate) ?? '' })) };
  }
}
