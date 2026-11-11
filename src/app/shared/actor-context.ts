import { Injectable } from '@angular/core';
import { ActorRole, FAIL_CLOSED_ROLE } from './portal-capabilities';

/**
 * Who is acting and what the tenant allows, as the container reports it. The portal keeps no
 * session and reads no token (norm 5.4.1). With no actor provided the factory below fails closed:
 * the portal reads only. The screen is convenience only (D-09): the service refuses what the actor
 * may not do, whatever the screen shows. Screens do not read the role: they ask PortalCapabilities.
 *
 * DP-PT-06 is open: an account with several roles has no defined way to choose which it acts as, so
 * this reports ONE internal role and the screens assume it.
 */
@Injectable({ providedIn: 'root', useFactory: () => new ReadOnlyActor() })
export abstract class ActorContext {
  abstract readonly role: ActorRole;
  /** Whether the tenant enabled the Collaborator to change descriptive information. False unless declared. */
  readonly collaboratorMayEditDescription: boolean = false;
  /** HU-COM-010 G-PERM: whether the Administrator granted the Collaborator Validar comprobantes (HU-SEC-006). False unless declared. */
  readonly collaboratorMayValidateProofs: boolean = false;
}

/** The default actor: reads and changes nothing. collaboratorMayEditDescription stays false. */
class ReadOnlyActor extends ActorContext {
  override readonly role = FAIL_CLOSED_ROLE;
}
