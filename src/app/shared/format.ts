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

/** `2026-09-18T06:30:00` to `18 sep 2026 · 06:30`, as the client screens write a departure; a date alone stays a date. */
export function departureLine(isoDateTime: string): string {
  const time = /T(\d{2}:\d{2})/.exec(isoDateTime)?.[1];
  return time ? `${formatDate(isoDateTime)} · ${time}` : formatDate(isoDateTime);
}

/** `2026-09-18T06:30:00-05:00` to `06:30`, read as written; empty for a date alone. */
export function timeOf(isoDateTime: string): string {
  return /T(\d{2}:\d{2})/.exec(isoDateTime)?.[1] ?? '';
}

/** `01 sep 2026 - 30 sep 2026`. */
export function formatDateRange(startIsoDate: string, endIsoDate: string): string {
  return `${formatDate(startIsoDate)} - ${formatDate(endIsoDate)}`;
}


/** An instant as the tenant writes it (Colombia, UTC-05:00 all year), so the screens read it as written: `2026-11-11T09:00:00Z` to `2026-11-11T04:00:00-05:00`. */
export function tenantInstant(instant: string | number): string {
  return `${new Date(new Date(instant).getTime() - 5 * 3_600_000).toISOString().slice(0, 19)}-05:00`;
}
