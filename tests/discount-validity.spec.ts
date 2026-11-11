import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { DemoDiscountRulesStore } from '../src/app/demo/discounts-demo';

// DP-PD2: the badge of a rule (Vigente, Próximo, Vencido, Inactivo) is resolved by the source, not by the screen.
describe('demoDiscountRulesStoreResolvesTheValidityOfEachRule', () => {
  const at = (day: string) => new DemoDiscountRulesStore(() => day);
  it('marks a rule in force between its dates, upcoming before and expired after, and inactive whatever the dates', async () => {
    const store = at('2026-10-14');
    const [inForce, upcoming, inactive] = await firstValueFrom(store.list());
    expect(inForce.validity).toEqual({ label: 'Vigente', tone: 'confirmed', inForce: true });
    expect(upcoming.validity).toEqual({ label: 'Próximo', tone: 'execution', inForce: false });
    expect(inactive.validity).toEqual({ label: 'Inactivo', tone: 'pending', inForce: false });
    expect((await firstValueFrom(at('2027-02-01').list()))[0].validity).toEqual({ label: 'Vencido', tone: 'finalized', inForce: false });
  });
});
