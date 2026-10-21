import { describe, expect, it } from 'vitest';
import { openDiscountForm } from './discount-form.helpers';
import { discountNamed } from './discount-rules-source.double';
import { apiError } from './catalog-items-writer.double';
import { parsePercentage } from '../src/app/shared/percentage';

const NAMES = ['tourId', 'percentage', 'calculationBase', 'cap', 'startsOn', 'endsOn', 'priority', 'stackable'];

describe('percentage text becomes exact basis points', () => {
  it.each([['12.5', 1250], ['0.07', 7], ['0.29', 29], ['1.15', 115], ['100', 10000], ['0.01', 1]])('%s becomes %i', (text, units) => {
    expect(parsePercentage(text as string)).toEqual({ kind: 'valid', minorUnits: units });
  });
  it.each(['', 'abc', '1e2', '-1', '0', '100.01', '0.007', '1,5', '.5', '99999999999999999'])('refuses %j', text => {
    expect(parsePercentage(text).kind).toBe('invalid');
  });
});
describe('discount form validates before sending', () => {
  it('shows empty, data, loading and retryable error form states', async () => {
    const f = await openDiscountForm(); const state = () => f.element.querySelector('form')!.getAttribute('data-state');
    expect(state()).toBe('empty'); await f.fill(); expect(state()).toBe('data');
    await f.submit(); expect(state()).toBe('loading'); f.writer.calls[0].fail(apiError()); await f.settle();
    expect(state()).toBe('error'); await f.submit(); expect(state()).toBe('loading'); expect(f.writer.calls[1].key).toBe(f.writer.calls[0].key);
  });
  it.each([['startsOn', ''], ['endsOn', ''], ['startsOn', '2027-01-01'], ['endsOn', '2025-01-01']])('refuses invalid validity at %s on blur', async (name, value) => {
    const f = await openDiscountForm(); await f.fill(); await f.text(name, value); await f.blur(name);
    expect(f.errorFor(name)).toMatch(/obligatori|fecha|vigencia/i);
    expect(f.field(name).getAttribute('aria-invalid')).toBe('true');
    expect(f.field(name).parentElement?.querySelector('[role="alert"]')).not.toBeNull();
    expect(f.writer.calls).toHaveLength(0); await f.submit(); expect(f.writer.calls).toHaveLength(0);
  });
  it('theRuleFormOffersTheMockupFieldsAndNoFixedAmount', async () => {
    const f = await openDiscountForm();
    expect(Array.from(f.element.querySelectorAll('[name]'), c => c.getAttribute('name'))).toEqual(NAMES);
    expect(Array.from((f.field('tourId') as HTMLSelectElement).options, o => o.textContent?.trim())).toEqual(['Selecciona un tour', 'Tour Montañas', 'Ruta del café']);
    expect(Array.from((f.field('calculationBase') as HTMLSelectElement).options, o => o.value)).toEqual(['ORIGINAL_VALUE', 'PREVIOUS_SUBTOTAL']);
    expect(Array.from((f.field('stackable') as HTMLSelectElement).options, o => o.textContent)).toEqual(['No', 'Sí']);
    expect(f.element.textContent).not.toMatch(/Nombre del descuento|Tipo de valor|Monto fijo|Monto del descuento/);
    for (const c of Array.from(f.element.querySelectorAll<HTMLInputElement>('input, select'))) expect(f.element.querySelector(`label[for="${c.id}"]`)).not.toBeNull();
  });
  it('theCalculationBaseHasNoHelpTextThatTheMockupDoesNotHave', async () => {
    const f = await openDiscountForm();
    expect(f.element.querySelector('small')).toBeNull();
    expect(f.element.textContent).not.toMatch(/se calcula sobre/);
  });
  it('draws the two numbered panels of the mockup with its labels, note and actions', async () => {
    const f = await openDiscountForm(); const panels = Array.from(f.element.querySelectorAll('form > section.crp-operator-panel'));
    expect(panels.map(s => s.querySelector('.crp-operator-eyebrow')?.textContent)).toEqual(['01. Descuento', '02. Vigencia y prioridad']);
    expect(panels.map(s => s.querySelector('h2')?.textContent)).toEqual(['Configura la promoción', 'Reglas de aplicación']);
    expect(panels[0].textContent).toContain('Los descuentos aplican únicamente a tours; no a transporte ni a establecimientos asociados.');
    expect(['tourId', 'percentage', 'calculationBase', 'cap'].every(n => panels[0].contains(f.field(n)))).toBe(true);
    expect(['startsOn', 'endsOn', 'priority', 'stackable'].every(n => panels[1].contains(f.field(n)))).toBe(true);
    const label = (name: string) => f.element.querySelector(`label[for="${f.field(name).id}"]`)?.textContent;
    expect(NAMES.map(label)).toEqual(['Tour', 'Porcentaje de descuento (1 a 100)', 'Base de cálculo', 'Tope del descuento',
      'Vigencia desde', 'Vigencia hasta', 'Prioridad (1 se aplica primero)', 'Acumulable']);
    expect(f.field('cap').getAttribute('placeholder')).toBe('Opcional, ej. $50.000');
    expect(f.element.textContent).toContain('Subtotal resultante del descuento anterior');
    expect(f.element.textContent).toContain('Completa los parámetros para publicar el descuento.');
    expect(Array.from(f.element.querySelectorAll('button'), b => b.textContent?.trim())).toEqual(['Cancelar', 'Crear descuento']);
    await f.submit(); expect(f.errorFor('tourId')).toBe('Elige el tour al que aplica el descuento.');
  });
  it('theFormOffersNoConditionOfUseField', async () => {
    const f = await openDiscountForm();
    expect(f.element.textContent).not.toMatch(/condicion|conditions?/i);
    expect(f.element.querySelector('[name="conditions"]')).toBeNull();
  });
  it('aTypedCapBecomesIntegerCents', async () => {
    const f = await openDiscountForm(); await f.fill(); await f.text('cap', '$80.000'); await f.submit();
    expect(f.writer.calls[0].command).toMatchObject({ capCents: 8_000_000 });
  });
  it.each([['0.07', 7], ['50000', 5_000_000]])('reads the cap %s as %i cents', async (text, cents) => {
    const f = await openDiscountForm(); await f.fill(); await f.text('cap', text); await f.submit();
    expect(f.writer.calls[0].command!.capCents).toBe(cents);
  });
  it.each(['0', 'abc', '-5'])('refuses the cap %j beside its field and sends nothing', async text => {
    const f = await openDiscountForm(); await f.fill(); await f.text('cap', text); await f.submit();
    expect(f.errorFor('cap')).toContain('El tope debe ser un valor en pesos mayor a cero'); expect(f.writer.calls).toHaveLength(0);
  });
  it('sends the tour, the integer basis points and the stacking flag, and no cap when it is empty', async () => {
    const f = await openDiscountForm(); await f.fill(); await f.text('stackable', 'si'); await f.submit();
    expect(f.writer.calls[0].command).toEqual({ tourId: 'tour-1', percentageBasisPoints: 1250, calculationBase: 'ORIGINAL_VALUE',
      startsOn: '2026-01-01', endsOn: '2026-12-31', priority: 1, stackable: true });
    f.writer.calls[0].reply(discountNamed('Stored')); await f.settle(); expect(f.saved).toEqual([discountNamed('Stored')]);
  });
  it.each([['percentage', '0'], ['percentage', '0.5'], ['percentage', '100.5'], ['priority', '1.5'], ['priority', '-1'], ['tourId', ''], ['calculationBase', '']])('refuses invalid %s %j', async (name, value) => {
    const f = await openDiscountForm(); await f.fill(); await f.text(name, value); await f.submit();
    expect(f.errorFor(name)).toBeTruthy(); expect(f.writer.calls).toHaveLength(0);
  });
  it('moves the focus to the first field in error when the submit is refused', async () => {
    const f = await openDiscountForm(); document.body.append(f.element); await f.fill();
    await f.text('priority', '0'); await f.text('percentage', '0'); await f.submit();
    expect(document.activeElement).toBe(f.field('percentage')); f.element.remove();
  });
  it('guards double clicks, disables controls, retries with the same key and renews after success', async () => {
    const f = await openDiscountForm(); await f.fill(); await f.submit(); await f.submit();
    expect(f.writer.calls).toHaveLength(1);
    for (const c of Array.from(f.element.querySelectorAll<HTMLInputElement>('input, select, button'))) expect(c.disabled).toBe(true);
    f.writer.calls[0].fail(apiError({ details: [{ field: 'priority', message: 'Priority conflict.' }] })); await f.settle();
    expect(f.errorFor('priority')).toContain('Priority conflict.'); await f.submit();
    expect(f.writer.calls[1].key).toBe(f.writer.calls[0].key);
    f.writer.calls[1].reply(discountNamed()); await f.settle(); await f.fill(); await f.submit();
    expect(f.writer.calls[2].key).not.toBe(f.writer.calls[0].key);
  });
  it('a changed submitted payload is a new intention', async () => {
    const f = await openDiscountForm(); await f.fill(); await f.submit(); f.writer.calls[0].fail(apiError()); await f.settle();
    await f.text('percentage', '15'); await f.submit(); expect(f.writer.calls[1].key).not.toBe(f.writer.calls[0].key);
  });
  it('updates the selected rule using a key and its id, keeping its cap and stacking flag', async () => {
    const f = await openDiscountForm({ ...discountNamed('Existing'), capCents: 8_000_000, stackable: true });
    expect(f.field('tourId').value).toBe('tour-Existing');
    expect(f.element.querySelector('h2')?.textContent).toBe('Actualiza la promoción');
    expect(f.element.querySelector('[type="submit"]')?.textContent?.trim()).toBe('Guardar cambios');
    expect(f.field('percentage').value).toBe('12.50'); expect(f.field('cap').value).toBe('$80.000'); expect(f.field('stackable').value).toBe('si');
    await f.text('percentage', '15'); await f.submit();
    expect(f.writer.calls[0]).toMatchObject({ kind: 'update', id: 'Existing', key: f.keys.generated[0],
      command: { percentageBasisPoints: 1500, capCents: 8_000_000, stackable: true } });
  });
});
