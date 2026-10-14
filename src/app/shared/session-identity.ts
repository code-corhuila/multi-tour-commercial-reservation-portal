import { InjectionToken } from '@angular/core';
import type { MountSession } from '../shell-contract';
import { SESSION_TEXT } from './session-copy';

/** Who the session says is signed in, ready to draw: a name to greet with (or none) and the avatar letters. */
export interface SessionIdentity {
  readonly name: string | null;
  readonly initials: string;
}

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * HU-FRT-001 amendment 003: displayName and initials are optional. Absent, empty or blank means no name (never invented,
 * never read from the token); the initials are the ones given or the first letters of the first two words of the name.
 * The result is plain text: the screens print it by interpolation, never as markup (RN-FRT-18).
 */
export function sessionIdentityOf(session: Pick<MountSession, 'displayName' | 'initials'>): SessionIdentity {
  const name = clean(session.displayName) || null;
  const given = clean(session.initials);
  const derived = (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => Array.from(word)[0]).join('');
  return { name, initials: (given ? Array.from(given).slice(0, 2).join('') : derived || SESSION_TEXT.neutralInitials).toUpperCase() };
}

/** Without a mount (tests, standalone run) the person is anonymous: "Hola, bienvenido" and the neutral avatar. */
export const SESSION_IDENTITY = new InjectionToken<SessionIdentity>('SESSION_IDENTITY', {
  factory: () => sessionIdentityOf({}),
});
