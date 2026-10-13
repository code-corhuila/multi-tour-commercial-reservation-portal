import { Injectable, signal } from '@angular/core';

/** Keys of the client areas the client header and footer open; a story registers its client area under one of them. */
export const CLIENT_AREA = Object.freeze({
  panel: 'client-panel', tours: 'tours', lodging: 'lodging', gastronomy: 'gastronomy', reservations: 'my-reservations',
} as const);

/**
 * The area the shell shows. A page opens another area through it ("Ver mis reservas", "Volver al panel cliente");
 * there is no router because the container owns the URL. Provided by the shell, so a page outside it gets none.
 */
@Injectable()
export class PortalNavigation {
  readonly selected = signal<string | undefined>(undefined);
  /** Parameters of the last opening (e.g. { departure, services, people }); every opening replaces them. */
  readonly params = signal<Readonly<Record<string, string>>>({});
  private keys: readonly string[] = [];

  /** The shell declares the areas it can show. */
  register(keys: readonly string[]): void { this.keys = keys; }

  has(key: string): boolean { return this.keys.includes(key); }

  /** Opens an area with optional parameters; false, and nothing changes, when the build has no such area. */
  open(key: string, params: Readonly<Record<string, string>> = {}): boolean {
    if (!this.has(key)) { return false; }
    this.params.set(params);
    this.selected.set(key);
    return true;
  }
}
