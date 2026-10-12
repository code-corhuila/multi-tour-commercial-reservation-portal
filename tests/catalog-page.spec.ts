import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { CatalogItemsSource, CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { CatalogPageComponent, PageState } from '../src/app/catalog/pages/catalog-page.component';
import { ControllableCatalogItemsSource, itemNamed } from './catalog-items-source.double';
import { ControllableCatalogItemsWriter } from './catalog-items-writer.double';

async function openPage() {
  const source = new ControllableCatalogItemsSource();
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogItemsSource, useValue: source },
      { provide: CatalogItemsWriter, useValue: new ControllableCatalogItemsWriter() },
    ],
  });
  const fixture: ComponentFixture<CatalogPageComponent> = TestBed.createComponent(CatalogPageComponent);
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const regions = () =>
    Array.from<Element>(fixture.nativeElement.querySelectorAll('[data-state]')).map((el) => el.getAttribute('data-state') ?? '');
  return { fixture, source, regions, settle };
}

describe('everyScreenShowsOneOfTheFourStates', () => {
  it('shows only "loading" while the source has not answered', async () => {
    const { regions, fixture } = await openPage();
    expect(regions()).toEqual(['loading']);
    expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull();
  });

  it('shows only "empty" for an empty list', async () => {
    const { regions, source, settle } = await openPage();
    source.requests[0].reply([]);
    await settle();
    expect(regions()).toEqual(['empty']);
  });

  it('shows "error" with a retry button, distinct from empty', async () => {
    const { regions, source, settle, fixture } = await openPage();
    source.requests[0].fail();
    await settle();
    expect(regions()).toEqual(['error']);
    expect(fixture.nativeElement.querySelector('button')).not.toBeNull();
  });

  it('shows the list when there is data', async () => {
    const { regions, source, settle, fixture } = await openPage();
    source.requests[0].reply([itemNamed('Alpha'), itemNamed('Beta')]);
    await settle();
    expect(regions()).toEqual(['data']);
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Alpha');
  });

  it('retry loads again and shows the new result', async () => {
    const { regions, source, settle, fixture } = await openPage();
    source.requests[0].fail();
    await settle();
    fixture.nativeElement.querySelector('button').click();
    await settle();
    expect(regions()).toEqual(['loading']);
    source.requests[1].reply([itemNamed('Gamma')]);
    await settle();
    expect(regions()).toEqual(['data']);
    expect(fixture.nativeElement.textContent).toContain('Gamma');
  });

  it('shows exactly one region after every answer, whatever came before', async () => {
    const { regions, source, settle, fixture } = await openPage();
    const answers: Array<[string, (index: number) => void]> = [
      ['data', (i) => source.requests[i].reply([itemNamed('Alpha')])],
      ['empty', (i) => source.requests[i].reply([])],
      ['error', (i) => source.requests[i].fail()],
    ];
    let index = 0;
    for (const [, first] of answers) {
      for (const [expectedKind, second] of answers) {
        first(index);
        await settle();
        expect(regions().length).toBe(1);

        fixture.componentInstance.reload();
        index++;
        await settle();
        expect(regions()).toEqual(['loading']);

        second(index);
        await settle();
        expect(regions()).toEqual([expectedKind]);

        fixture.componentInstance.reload();
        index++;
        await settle();
      }
    }
  });
});

describe('theNewestRequestWins', () => {
  it('shows the second result and never the first, even if the first arrives later, and cancels the first', async () => {
    const { regions, source, settle, fixture } = await openPage();
    fixture.componentInstance.reload();
    await settle();
    expect(source.requests.length).toBe(2);
    expect(source.requests[0].isOpen()).toBe(false);
    expect(source.requests[1].isOpen()).toBe(true);

    source.requests[1].reply([itemNamed('Fast')]);
    await settle();
    source.requests[0].reply([itemNamed('Slow')]);
    await settle();

    expect(regions()).toEqual(['data']);
    expect(fixture.nativeElement.textContent).toContain('Fast');
    expect(fixture.nativeElement.textContent).not.toContain('Slow');
  });
});

describe('thePageStateAllowsNoFifthCombination', () => {
  it('has exactly four kinds and refuses mixed shapes at compile time', () => {
    expectTypeOf<PageState['kind']>().toEqualTypeOf<'loading' | 'error' | 'empty' | 'data'>();

    const illegal = () => {
      // @ts-expect-error loading carries no items
      const loadingWithData: PageState = { kind: 'loading', items: [] };
      // @ts-expect-error data must carry its items
      const dataWithoutItems: PageState = { kind: 'data' };
      // @ts-expect-error empty carries no retry
      const emptyWithRetry: PageState = { kind: 'empty', retry: () => undefined };
      // @ts-expect-error a fifth kind does not exist
      const fifth: PageState = { kind: 'refreshing' };
      return [loadingWithData, dataWithoutItems, emptyWithRetry, fifth];
    };
    expect(typeof illegal).toBe('function');

    const label = (state: PageState): string => {
      switch (state.kind) {
        case 'loading':
        case 'error':
        case 'empty':
        case 'data':
          return state.kind;
        default: {
          const unreachable: never = state;
          return unreachable;
        }
      }
    };
    expect(label({ kind: 'empty' })).toBe('empty');
  });
});
