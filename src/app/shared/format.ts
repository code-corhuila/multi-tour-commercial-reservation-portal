/** Formats of the authorized screens (12-ux-ui/authorized-screens.md, section 3). Pure: no locale data of the runtime. */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

/** Cents to pesos as the screens write them: `$1.039.200`, a discount `-$259.800`. */
export function formatCop(cents: number): string {
  const pesos = Math.round(Math.abs(cents) / 100);
  const grouped = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cents < 0 && pesos > 0 ? '-' : ''}$${grouped}`;
}

/** `2026-09-15` (or an ISO date-time, read as written) to `15 sep 2026`; any other text is returned as it came. */
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${match[3]} ${month} ${match[1]}` : isoDate;
}

/** `01 sep 2026 - 30 sep 2026`. */
export function formatDateRange(startIsoDate: string, endIsoDate: string): string {
  return `${formatDate(startIsoDate)} - ${formatDate(endIsoDate)}`;
}
