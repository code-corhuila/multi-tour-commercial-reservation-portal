import { ActorRole } from '../src/app/shared/portal-capabilities';
import { ActorContext } from '../src/app/shared/actor-context';

/**
 * A test actor. It acts as one internal role (DP-PT-06 is open: how an account with several roles
 * picks one is undefined, so these tests assume the internal role). The tenant flag is false unless
 * a test declares it, like any actor that does not say.
 */
export function actorAs(role: ActorRole, collaboratorMayEditDescription = false): ActorContext {
  return new (class extends ActorContext {
    override readonly role = role;
    override readonly collaboratorMayEditDescription = collaboratorMayEditDescription;
  })();
}
