import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import { apiError } from './catalog-items-writer.double';
import { openCurrentDiscounts, ruleNamed, serviceNamed } from './current-discounts.double';

// HU-COM-004 spec section 3, AC-CD.5 to AC-CD.9 (tasks T-03 and T-04).
const withData = async (role?: Parameters<typeof openCurrentDiscounts>[0]) => {
  const page = await openCurrentDiscounts(role);
  page.source.requests[0].reply([serviceNamed('Tatacoa', [ruleNamed('Season', 1, { percentageBasisPoints: 1000 })])]);
  await page.settle();
  return page;
};
const fillAdditional = async (page: Awaited<ReturnType<typeof withData>>, value = '5', reason = 'Loyal customer') => {
  await page.type('value', value); await page.type('reason', reason);
};
const submit = async (page: Awaited<ReturnType<typeof withData>>) => { page.submitButton().click(); await page.settle(); };

describe('theAdditionalDiscountIsLastWithItsReasonAndAuthor', () => {
  it('registers the additional discount and shows it after the current ones, on their subtotal', async () => {
    const page = await withData();
    await fillAdditional(page);
    await submit(page);
    expect(page.writer.calls).toHaveLength(1);
    expect(page.writer.calls[0].command).toEqual({ serviceId: 'svc-Tatacoa', type: 'PERCENTAGE', percentageBasisPoints: 500, reason: 'Loyal customer' });
    page.writer.calls[0].reply({ ...page.writer.calls[0].command, authorizedBy: 'Laura Demo' });
    await page.settle();
    const lines = page.lines();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Season');
    for (const text of ['Additional discount', 'Loyal customer', 'Laura Demo', '90000.00', '4500.00', '85500.00']) expect(lines[1]).toContain(text);
    expect(page.element.textContent).toContain('85500.00');
  });

  it('takes the authorizer from the stored answer, never from a field the person types', async () => {
    const page = await withData();
    expect(Array.from(page.element.querySelectorAll('form label'), (label) => label.textContent?.trim())).toEqual(['Value', 'Reason', 'Value type']);
  });
});

describe('anEmptyReasonOrValueIsRefusedBesideItsField', () => {
  it('shows each error beside its field and sends nothing', async () => {
    const page = await withData();
    await submit(page);
    expect(page.errorFor('reason')).toContain('Reason required');
    expect(page.errorFor('value')).toContain('positive value');
    for (const value of ['0', '-3', 'abc']) {
      await fillAdditional(page, value, 'Loyal customer');
      await submit(page);
      expect(page.errorFor('value')).toContain('positive value');
      expect(page.errorFor('reason')).toBeFalsy();
    }
    await fillAdditional(page, '5', '   ');
    await submit(page);
    expect(page.errorFor('reason')).toContain('Reason required');
    expect(page.writer.calls).toHaveLength(0);
  });
});

describe('aRetriedRegistrationReusesItsIdempotencyKey', () => {
  it('sends one request for a double click and disables submit while pending', async () => {
    const page = await withData();
    await fillAdditional(page);
    page.submitButton().click(); page.submitButton().click();
    await page.settle();
    expect(page.writer.calls).toHaveLength(1);
    expect(page.submitButton().disabled).toBe(true);
  });

  it('reuses the key on a retry after an error, and uses a new one for the next intention', async () => {
    const page = await withData();
    await fillAdditional(page);
    await submit(page);
    page.writer.calls[0].fail(apiError({ userMessage: 'Try again later.' }));
    await page.settle();
    expect(page.element.textContent).toContain('Try again later.');
    await submit(page);
    expect(page.writer.calls[1].key).toBe(page.writer.calls[0].key);
    page.writer.calls[1].reply({ ...page.writer.calls[1].command, authorizedBy: 'Laura Demo' });
    await page.settle();
    await fillAdditional(page, '7', 'Second intention');
    await submit(page);
    expect(page.writer.calls[2].key).not.toBe(page.writer.calls[0].key);
  });

  it('uses a new key when the person changes the data after a failure', async () => {
    const page = await withData();
    await fillAdditional(page);
    await submit(page);
    page.writer.calls[0].fail(apiError());
    await page.settle();
    await fillAdditional(page, '6');
    await submit(page);
    expect(page.writer.calls[1].key).not.toBe(page.writer.calls[0].key);
  });
});

describe('onlyTheTenantAdministratorSeesTheAdditionalDiscountForm', () => {
  it('offers the form to the Tenant Administrator', async () => {
    const page = await withData('TENANT_ADMINISTRATOR');
    expect(page.element.querySelector('form')).not.toBeNull();
  });

  for (const role of ['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'READ_ONLY'] as const) {
    it(`shows ${role} the breakdown without the form`, async () => {
      const page = await withData(role);
      expect(page.lines()).toHaveLength(1);
      expect(page.element.querySelector('form')).toBeNull();
    });
  }
});

describe('theValueViewShowsOneOfTheFourStates', () => {
  it('goes through loading, error with retry, empty and data', async () => {
    const page = await openCurrentDiscounts();
    expect(page.state()).toBe('loading');
    page.source.requests[0].fail(); await page.settle();
    expect(page.state()).toBe('error');
    Array.from(page.element.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Retry')!.click(); await page.settle();
    expect(page.state()).toBe('loading');
    page.source.requests[1].reply([]); await page.settle();
    expect(page.state()).toBe('empty');
    page.fixture.componentInstance.reload(); page.source.requests[2].reply([serviceNamed('Tatacoa')]); await page.settle();
    expect(page.state()).toBe('data');
    expect(page.element.textContent).toContain('100000.00');
  });

  it('shows only the base value for a service with no rule in force', async () => {
    const page = await openCurrentDiscounts('ANALYST');
    page.source.requests[0].reply([serviceNamed('Pitalito', [ruleNamed('Old', 1, { endsOn: '2020-01-01' })])]); await page.settle();
    expect(page.lines()).toEqual([]);
    expect(page.element.textContent).toContain('100000.00');
    expect(page.element.textContent).not.toContain('Final value');
  });

  it('asks the source again for the date the person picks (DP-CD1)', async () => {
    const page = await openCurrentDiscounts();
    const date = page.element.querySelector<HTMLInputElement>('input[type="date"]')!;
    expect(page.element.querySelector(`label[for="${date.id}"]`)).not.toBeNull();
    date.value = '2026-03-01'; date.dispatchEvent(new Event('change')); await page.settle();
    expect(page.source.requests.at(-1)!.date).toBe('2026-03-01');
  });
});

describe('currentDiscountsAreWiredInTheMountEntry', () => {
  let host: HTMLElement; let cleanup: () => void;
  afterEach(() => { cleanup(); host.remove(); });
  it('opens the area from the navigation with the in-memory demo data', async () => {
    host = document.createElement('div'); document.body.append(host);
    const request = vi.fn(async () => ({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } }));
    cleanup = entry.mount(host, { apiClient: { request } as never, session: { roles: ['TENANT_ADMINISTRATOR'], open: () => undefined, close: () => undefined } });
    await vi.waitFor(() => expect(host.querySelector('nav')).toBeTruthy());
    Array.from(host.querySelectorAll('nav button')).find((b) => b.textContent === 'Current discounts')!.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(host.querySelectorAll('[data-line]').length).toBeGreaterThan(0));
    expect(host.querySelector('form')).not.toBeNull();
  });
});

describe('aRefusedSubmitMovesTheFocusToTheFirstFieldInError', () => {
  it('focuses the percentage when both fields are refused, and the reason when only it is', async () => {
    const page = await withData(); document.body.append(page.element);
    await submit(page);
    expect(document.activeElement).toBe(page.field('value'));
    await fillAdditional(page, '5', '   '); (document.activeElement as HTMLElement).blur(); await submit(page);
    expect(document.activeElement).toBe(page.field('reason')); page.element.remove();
  });
});
