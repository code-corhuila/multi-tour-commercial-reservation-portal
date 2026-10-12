import { Injectable } from '@angular/core';
import { CustomerStanding, standingOf } from '../model/self-service-reservation';

/** PROPUESTO, pending HU-FRT-001: the event the portal raises on its host so the container opens its sign-in. */
export const SIGN_IN_REQUESTED_EVENT = 'crp-sign-in-requested';

/**
 * DP-RS2: the final customer as this area sees them, derived from props.session.roles in mount-entry.ts.
 * ActorContext of HU-COM-001 is untouched. With nothing provided it fails closed to OTHER: no confirmation.
 * DP-RS1: the portal keeps no token or storage; without a session it asks the container to sign in,
 * and the container remounts it on the same URL, which still carries the selection.
 */
@Injectable({ providedIn: 'root', useFactory: () => customerContextFor(['UNKNOWN'], () => undefined) })
export abstract class CustomerContext {
  abstract readonly standing: CustomerStanding;
  abstract requestSignIn(): void;
}

export function customerContextFor(roles: readonly string[], askSignIn: () => void): CustomerContext {
  return new (class extends CustomerContext {
    override readonly standing = standingOf(roles);
    override requestSignIn(): void { askSignIn(); }
  })();
}
