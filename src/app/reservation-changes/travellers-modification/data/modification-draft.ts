import { Injectable, computed, signal } from '@angular/core';
import { TravellersChange } from './modification-ports';

/** Pillar 3: a whole count read from text. "3" is 3; "0", "", "-1", "2.5" and "abc" are not travellers. */
export function parseTravellers(text: string): number | null {
  const typed = text.trim();
  return /^[1-9]\d{0,2}$/.test(typed) ? Number(typed) : null;
}

/**
 * The number of travellers typed in the panel, shared by the panel and the registry entry (plan D-09): the page of HU-COM-013 knows no field of a type.
 * Opened with the travellers the reservation has; the change is what the entry sends and what the lines are asked for.
 */
@Injectable({ providedIn: 'root' })
export class ModificationDraft {
  readonly current = signal(0);
  readonly typed = signal('');
  readonly people = computed(() => parseTravellers(this.typed()));
  /** Valid count, whether or not it differs from the reservation (the lines are shown either way). */
  readonly delta = computed<TravellersChange | null>(() => {
    const people = this.people(), current = this.current();
    return people === null ? null : { added: Math.max(0, people - current), removed: Math.max(0, current - people) };
  });
  /** A valid count that differs from the reservation: the only change "Registrar novedad" may send. */
  readonly change = computed<TravellersChange | null>(() => {
    const delta = this.delta();
    return delta && (delta.added > 0 || delta.removed > 0) ? delta : null;
  });

  open(current: number): void {
    this.current.set(current);
    this.typed.set(String(current));
  }
}
