import { Injectable, signal } from '@angular/core';

/**
 * The area the shell shows. A page opens another area through it ("Ver mis reservas", "Volver al panel cliente");
 * there is no router because the container owns the URL. Provided by the shell, so a page outside it gets none.
 */
@Injectable()
export class PortalNavigation {
  readonly selected = signal<string | undefined>(undefined);
  private keys: readonly string[] = [];

  /** The shell declares the areas it can show. */
  register(keys: readonly string[]): void { this.keys = keys; }

  has(key: string): boolean { return this.keys.includes(key); }

  open(key: string): void { if (this.has(key)) { this.selected.set(key); } }
}
