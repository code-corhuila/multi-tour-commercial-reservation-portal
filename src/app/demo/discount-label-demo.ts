/** DEMO: the whole percentage a current value is below its base value (`20` for $1.299.000 against $1.039.200); 0 when there is no base. */
export function pctOff(baseCents: number, currentCents: number): number {
  return baseCents > 0 ? Math.round(((baseCents - currentCents) / baseCents) * 100) : 0;
}

/** DEMO: the tag HU-COM-004 would write for a discounted tour, `20% de descuento`; undefined when the value is not discounted. */
export function discountLabelOf(baseCents: number, currentCents: number): string | undefined {
  return currentCents !== baseCents ? `${pctOff(baseCents, currentCents)}% de descuento` : undefined;
}
