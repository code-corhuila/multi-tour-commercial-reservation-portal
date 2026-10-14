import { Observable, Subject } from 'rxjs';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { CatalogItem } from '../src/app/catalog/model/catalog-item';

/** One request the page made, which the test answers or fails when it decides. */
export interface PendingRequest {
  readonly reply: (items: readonly CatalogItem[]) => void;
  readonly fail: () => void;
  /** True while the page still listens; false once it answered, failed or cancelled. */
  readonly isOpen: () => boolean;
}

/** A controllable source for tests only: it never answers on its own, so a test sets the timing. */
export class ControllableCatalogItemsSource extends CatalogItemsSource {
  readonly requests: PendingRequest[] = [];

  override list(): Observable<readonly CatalogItem[]> {
    return new Observable<readonly CatalogItem[]>((subscriber) => {
      const answers = new Subject<readonly CatalogItem[]>();
      const inner = answers.subscribe(subscriber);
      let open = true;
      this.requests.push({
        reply: (items) => {
          answers.next(items);
          answers.complete();
        },
        fail: () => answers.error(new Error('service down')),
        isOpen: () => open,
      });
      return () => {
        open = false;
        inner.unsubscribe();
      };
    });
  }
}

export function itemNamed(commercialName: string): CatalogItem {
  return {
    serviceId: `00000000-0000-0000-0000-${commercialName.padStart(12, '0').slice(-12)}`,
    serviceType: 'TOUR',
    commercialName,
    catalogStatus: 'ACTIVE',
    baseRateCents: 1000,
    baseOperationalCostCents: 500,
    configuredCapacity: null,
    transportRequired: false,
    highRisk: false,
    validFrom: '2026-09-01',
    validTo: '2026-09-30',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}
