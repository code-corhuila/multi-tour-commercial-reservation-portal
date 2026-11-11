/**
 * Where the focus goes when a screen changes under the person (amendment 2026-10-13, HC-4, plan H-D5; NFR-008, Annex H).
 * Every form and area of the portal uses these two functions instead of moving the focus on its own.
 */

/** Focuses the first field marked `aria-invalid="true"` inside `form`; false when no field is in error. */
export function focusFirstError(form: ParentNode): boolean {
  const field = form.querySelector<HTMLElement>('[aria-invalid="true"]');
  field?.focus();
  return field != null;
}

/**
 * Focuses the first `h1` inside `area`, made focusable by script only (`tabindex="-1"`, out of the tab order),
 * so a screen reader announces the area that opened; false when the area has no heading.
 */
export function focusHeading(area: ParentNode): boolean {
  const heading = area.querySelector<HTMLElement>('h1');
  if (!heading) { return false; }
  if (!heading.hasAttribute('tabindex')) { heading.setAttribute('tabindex', '-1'); }
  heading.focus();
  return true;
}
