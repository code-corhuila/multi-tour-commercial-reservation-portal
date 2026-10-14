import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, withoutComments } from './source-files';
import { openDiscountForm } from './discount-form.helpers';
const forbiddenAction = /delete|remove|erase|destroy|borrar|eliminar|suprimir/i;
const undefinedFields = /application|conditions?|aplicaci[oó]n de|condiciones/i;
describe('discount feature preserves its absences', () => {
  it('offers no forbidden action in any identifier, text, class, or route', () => {
    const files = listSourceFiles().filter(f => f.startsWith('src/app/discounts/'));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) expect(withoutComments(readFileSync(f, 'utf8')).replace(/DestroyRef|takeUntilDestroyed/g, ''), f).not.toMatch(forbiddenAction);
  });
  it('renders only the controls the mockup defines and no condition of use, even disabled', async () => {
    const f = await openDiscountForm();
    expect(Array.from(f.element.querySelectorAll('[name]'), c => c.getAttribute('name')).sort())
      .toEqual(['calculationBase', 'cap', 'endsOn', 'percentage', 'priority', 'stackable', 'startsOn', 'tourId']);
    expect(f.element.textContent).not.toMatch(undefinedFields);
    for (const path of listSourceFiles().filter(p => p.startsWith('src/app/discounts/'))) {
      expect(withoutComments(readFileSync(path, 'utf8')).replace(/PortalCapabilities|portal-capabilities/g, ''), path).not.toMatch(undefinedFields);
    }
  });
  it('owns no HTTP client, session, credential handling, or gateway URL', () => {
    for (const f of listSourceFiles().filter(p => p.startsWith('src/app/discounts/'))) {
      expect(withoutComments(readFileSync(f, 'utf8')), f).not.toMatch(/HttpClient|provideHttpClient|fetch\s*\(|XMLHttpRequest|axios|localStorage|sessionStorage|Authorization|Bearer|https?:\/\//);
    }
  });
  it('absence detectors reject representative accidental additions', () => {
    expect('class RemoveRule {}').toMatch(forbiddenAction);
    for (const field of ['application', 'conditions']) expect(`<input name="${field}">`).toMatch(undefinedFields);
  });
});
