import { Observable, EMPTY, defer, expand, reduce, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiError, PortalApiClient } from '../shell-contract';

/** The gateway route of this service; it may change with the gateway decision. Only the path: the container client owns the host. */
export const API_BASE = '/api/v1/commercial-reservation';

export const catalogPath = (serviceId?: string, action?: 'inactivate' | 'reactivate'): string =>
  [`${API_BASE}/catalog/services`, serviceId, action].filter(Boolean).join('/');
export const establishmentsPath = (associationId?: string, action?: 'inactivate' | 'reactivate'): string =>
  [`${API_BASE}/associated-establishments`, associationId, action].filter(Boolean).join('/');

interface Page<T> { readonly data: readonly T[]; readonly meta: { readonly page: number; readonly totalPages: number } }
type Init = Parameters<PortalApiClient['request']>[1];

/** The container rejects with {status, code, message, details?, traceId}; the pages read `userMessage`, which is the same message. */
export function toPageError(error: unknown): ApiError {
  const e = error as Partial<ApiError> | null;
  if (typeof e?.message !== 'string' || typeof e.code !== 'string') {
    return { status: 0, code: 'UNKNOWN', message: 'The request failed.', details: [], traceId: '', userMessage: 'La solicitud falló.' };
  }
  return { status: e.status ?? 0, code: e.code, message: e.message, details: Array.isArray(e.details) ? e.details : [], traceId: e.traceId ?? '', userMessage: e.message };
}

/** Lazy (nothing is sent until subscribed) and with the failure already in the shape the pages read. */
export function call<T>(client: PortalApiClient, path: string, init?: Init): Observable<T> {
  return defer(() => client.request<T>(path, init)).pipe(catchError((error) => throwError(() => toPageError(error))));
}

/** Every page of a paginated list (the contract caps a page at 100). */
export function listAll<T>(client: PortalApiClient, path: string, filters: Record<string, string | undefined> = {}): Observable<readonly T[]> {
  const page = (n: number) => {
    const query = new URLSearchParams({ page: String(n), limit: '100' });
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    return call<Page<T>>(client, `${path}?${query}`);
  };
  return page(1).pipe(
    expand((result) => (result.meta.page < result.meta.totalPages ? page(result.meta.page + 1) : EMPTY)),
    reduce((all, result) => [...all, ...result.data], [] as readonly T[]),
  );
}
