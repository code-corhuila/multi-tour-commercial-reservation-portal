import { Observable, Subject, of } from 'rxjs';
import { CompanionsRecord, CustomerCompanionsSource, CustomerCompanionsWriter } from '../src/app/customers/data/customer-companions-ports';
import { CustomerCompanion } from '../src/app/shared/customer-companions';

/** Invented people only (RN-PC9). */
export const COMPANION_A: CustomerCompanion = { fullName: 'Acompañante Ficticio Uno', document: 'DEMO-2001', birthDate: '2001-05-01', phone: '300 000 2001', emergency: 'Contacto Ficticio 300 000 0001' };
export const COMPANION_B: CustomerCompanion = { fullName: 'Acompañante Ficticio Dos', document: 'DEMO-2002', birthDate: '2003-07-09', phone: '', emergency: 'Contacto Ficticio 300 000 0002' };
export const HOLDER_DOCUMENT = 'DEMO-1003';

/** Types invented data into the holder card and every companion card drawn under `root`, as a person would before confirming screen 21 (DP-RS5: the holder is required). */
export function fillCompanionsIn(root: ParentNode): void {
  const holder = { name: 'Titular Ficticio', document: 'DEMO-1001', phone: '300 000 0000', email: 'titular@example.invalid', birthdate: '1990-04-12' };
  for (const [field, value] of Object.entries(holder)) {
    const input = root.querySelector<HTMLInputElement>('#crp-holder-' + field);
    if (input) { input.value = value; input.dispatchEvent(new Event('input')); }
  }
  const data = { fullName: 'Acompañante Ficticio', document: 'DEMO-5', birthDate: '2001-05-01', emergency: 'Contacto Ficticio 300' };
  for (let i = 0; root.querySelector(`[name="companion-fullName-${i}"]`); i += 1) {
    for (const [field, value] of Object.entries(data)) {
      const input = root.querySelector<HTMLInputElement>(`[name="companion-${field}-${i}"]`)!;
      input.value = field === 'document' ? `${value}${i}` : value; input.dispatchEvent(new Event('input'));
    }
  }
}

export class StaticCompanionsSource extends CustomerCompanionsSource {
  readonly loaded: string[] = [];
  constructor(private readonly record: CompanionsRecord = { holderDocument: HOLDER_DOCUMENT, companions: [] }) { super(); }
  override load(reservationId: string): Observable<CompanionsRecord> { this.loaded.push(reservationId); return of(this.record); }
}

export interface SaveCall {
  readonly reservationId: string; readonly companions: readonly CustomerCompanion[]; readonly key: string;
  readonly reply: () => void; readonly fail: (error?: unknown) => void;
}

/** A writer that records every save and answers when the test says. */
export class ControllableCompanionsWriter extends CustomerCompanionsWriter {
  readonly calls: SaveCall[] = [];
  override save(reservationId: string, companions: readonly CustomerCompanion[], key: string): Observable<void> {
    const answers = new Subject<void>();
    this.calls.push({ reservationId, companions, key, reply: () => { answers.next(); answers.complete(); }, fail: (error = new Error('unavailable')) => answers.error(error) });
    return answers.asObservable();
  }
}
