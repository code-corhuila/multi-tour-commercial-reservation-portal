/**
 * What the multi-tour-front container guarantees to every portal: a failed request
 * reaches the portal as this shape, never as a raw transport error, and
 * `userMessage` is already decided by the container.
 *
 * Types only, on purpose: the container does not exist yet (G-FRT), so this mirrors
 * the course template and must be reconciled with the contract it publishes.
 */
export interface FieldError {
  field: string;
  message: string;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details: FieldError[];
  traceId: string;
  userMessage: string;
}

/** What the container hands to `mount` (ADR-006 F4); mirrors multi-tour-front `core/client/types.ts`. */
export interface MountProps {
  identifier?: string;
  apiClient: { request<T>(path: string, init?: unknown): Promise<T> };
  session: { readonly roles: string[]; open(answer: unknown): void; close(): void };
  /** PROPUESTO for ADR-007 (008- H-D10): parameters the container keeps across a remount, e.g. a selection in progress. */
  initialParams?: Readonly<Record<string, string>>;
}

export type PortalApiClient = MountProps['apiClient'];
