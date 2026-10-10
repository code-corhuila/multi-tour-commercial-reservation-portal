import { Observable, Subject } from 'rxjs';
import { CatalogItemsWriter, IdempotencyKeys } from '../src/app/catalog/data/catalog-api.service';
import { CatalogItem, CreateCatalogItemCommand, UpdateCatalogItemCommand } from '../src/app/catalog/model/catalog-item';
import { ApiError } from '../src/app/shell-contract';

interface WriteCallBase {
  readonly reply: (item: CatalogItem) => void;
  readonly fail: (error: ApiError) => void;
}

export type WriteCall =
  | (WriteCallBase & { readonly kind: 'create'; readonly serviceId: null; readonly command: CreateCatalogItemCommand; readonly idempotencyKey: string })
  | (WriteCallBase & { readonly kind: 'update'; readonly serviceId: string; readonly command: UpdateCatalogItemCommand });

/** A controllable writer for tests only: it never answers on its own, so a test sets the timing. */
export class ControllableCatalogItemsWriter extends CatalogItemsWriter {
  readonly calls: WriteCall[] = [];

  override create(command: CreateCatalogItemCommand, idempotencyKey: string): Observable<CatalogItem> {
    const { answers, base } = this.open();
    this.calls.push({ ...base, kind: 'create', serviceId: null, command, idempotencyKey });
    return answers.asObservable();
  }

  override update(serviceId: string, command: UpdateCatalogItemCommand): Observable<CatalogItem> {
    const { answers, base } = this.open();
    this.calls.push({ ...base, kind: 'update', serviceId, command });
    return answers.asObservable();
  }

  private open(): { answers: Subject<CatalogItem>; base: WriteCallBase } {
    const answers = new Subject<CatalogItem>();
    return {
      answers,
      base: {
        reply: (item) => {
          answers.next(item);
          answers.complete();
        },
        fail: (error) => answers.error(error),
      },
    };
  }
}

/** Keys that count themselves, so a test can tell which one travelled with which call. */
export class ControllableIdempotencyKeys extends IdempotencyKeys {
  readonly generated: string[] = [];

  override generate(): string {
    const key = `test-key-${String(this.generated.length).padStart(4, '0')}`;
    this.generated.push(key);
    return key;
  }
}

export function apiError(overrides: Partial<ApiError> = {}): ApiError {
  return {
    status: 422,
    code: 'VALIDATION_FAILED',
    message: 'rejected',
    details: [],
    traceId: 'trace-1',
    userMessage: 'The change was refused.',
    ...overrides,
  };
}
