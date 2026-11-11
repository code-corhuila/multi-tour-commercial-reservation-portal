/**
 * The four states of a screen (RN-P2, D-05) as one value. Three booleans would allow eight
 * combinations for four legal states, and the illegal ones are the blank screens Annex H forbids.
 * Shared by every story (amendment 2026-10-13, plan H-D2); each screen names its record type.
 */
export type PageState<T = unknown> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly retry: () => void; readonly userMessage?: string; readonly traceId?: string }
  | { readonly kind: 'empty' }
  | { readonly kind: 'data'; readonly items: readonly T[] };
