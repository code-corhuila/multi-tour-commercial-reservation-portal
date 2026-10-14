import { Injectable, signal } from '@angular/core';

/** Keys of the client areas the client header and footer open; a story registers its client area under one of them. */
export const CLIENT_AREA = Object.freeze({
  panel: 'client-panel', tours: 'tours', lodging: 'lodging', gastronomy: 'gastronomy', reservations: 'my-reservations',
  /** HU-COM-014 mis-pagos.html, opened from 17. */
  payments: 'my-payments',
  /** profile.html, opened by the Perfil button of the client header and by the avatar of the compact header. */
  profile: 'profile',
} as const);

/**
 * The area the shell shows. A page opens another area through it ("Ver mis reservas", "Volver al panel cliente");
 * there is no router because the container owns the URL. Provided by the shell, so a page outside it gets none.
 */
@Injectable()
export class PortalNavigation {
  readonly selected = signal<string | undefined>(undefined);
  /** Every opening, also of the area already open: the shell draws the area anew, so its own item takes it back to its start. */
  readonly visit = signal(0);
  /** Parameters of the last opening (e.g. { departure, services, people }); every opening replaces them. */
  readonly params = signal<Readonly<Record<string, string>>>({});
  private keys: readonly string[] = [];
  private opened: () => void = () => undefined;

  /** The shell declares the areas it can show and what follows an opening (the focus, HC-4). */
  register(keys: readonly string[], opened: () => void = () => undefined): void { this.keys = keys; this.opened = opened; }

  has(key: string): boolean { return this.keys.includes(key); }

  /** Opens an area with optional parameters; false, and nothing changes, when the build has no such area. */
  open(key: string, params: Readonly<Record<string, string>> = {}): boolean {
    if (!this.has(key)) { return false; }
    this.params.set(params);
    this.selected.set(key);
    this.visit.update((n) => n + 1);
    this.opened();
    return true;
  }
}
