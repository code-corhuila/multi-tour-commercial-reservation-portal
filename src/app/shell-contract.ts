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
