import { Observable, Subject } from 'rxjs';
import { CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { CatalogItem, CreateCatalogItemCommand, UpdateCatalogItemCommand } from '../src/app/catalog/model/catalog-item';
import { ApiError } from '../src/app/shell-contract';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';

interface WriteCallBase {
  readonly reply: (item: CatalogItem) => void;
  readonly fail: (error: ApiError) => void;
}

export type WriteCall =
  | (WriteCallBase & { readonly kind: 'create'; readonly serviceId: null; readonly command: CreateCatalogItemCommand; readonly idempotencyKey: string })
  | (WriteCallBase & { readonly kind: 'update'; readonly serviceId: string; readonly command: UpdateCatalogItemCommand });

/** A status action (inactivate or reactivate), kept apart from `calls` because it carries no command. */
export interface StatusCall {
  readonly kind: 'inactivate' | 'reactivate';
  readonly serviceId: string;
  /** How many arguments the writer received, so a test can prove no key travels with a status action. */
  readonly argumentCount: number;
  readonly reply: (item: CatalogItem) => void;
  readonly fail: (error: unknown) => void;
}

/** A controllable writer for tests only: it never answers on its own, so a test sets the timing. */
export class ControllableCatalogItemsWriter extends CatalogItemsWriter {
  readonly calls: WriteCall[] = [];
  readonly statusCalls: StatusCall[] = [];

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

  override inactivate(serviceId: string, ...rest: unknown[]): Observable<CatalogItem> {
    return this.recordStatus('inactivate', serviceId, rest.length + 1);
  }

  override reactivate(serviceId: string, ...rest: unknown[]): Observable<CatalogItem> {
    return this.recordStatus('reactivate', serviceId, rest.length + 1);
  }

  private recordStatus(kind: StatusCall['kind'], serviceId: string, argumentCount: number): Observable<CatalogItem> {
    const answers = new Subject<CatalogItem>();
    this.statusCalls.push({
      kind,
      serviceId,
      argumentCount,
      reply: (item) => {
        answers.next(item);
        answers.complete();
      },
      fail: (error) => answers.error(error),
    });
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
