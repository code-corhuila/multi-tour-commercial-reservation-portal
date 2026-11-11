/** What a failed read hands to its error state: the single message of the portal and the trace to quote to support. */
export type ReadFailure = { readonly userMessage?: string; readonly traceId?: string };

/** The `userMessage` and `traceId` of an API error (as the writes read them); nothing for any other failure, so the page copy stays. */
export function readFailure(error: unknown): ReadFailure {
  const e = error as { userMessage?: unknown; traceId?: unknown } | null | undefined;
  const userMessage = typeof e?.userMessage === 'string' && e.userMessage ? e.userMessage : undefined;
  const traceId = typeof e?.traceId === 'string' && e.traceId ? e.traceId : undefined;
  return { ...(userMessage ? { userMessage } : {}), ...(traceId ? { traceId } : {}) };
}
