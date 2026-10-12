import { Injectable, inject } from '@angular/core';
import { ActorContext } from './catalog/data/catalog-api.service';

/** Who a shell area is for: the operator sidebar or the client header of the authorized client screens. */
export type Audience = 'operator' | 'customer';

/**
 * Which layout the visitor gets. Default: the operator when the container reported an operator role,
 * otherwise the customer (a final customer or a visitor without a session). A build may provide its own.
 */
@Injectable({ providedIn: 'root', useFactory: () => ({ audience: inject(ActorContext).role === 'READ_ONLY' ? 'customer' : 'operator' }) })
export abstract class PortalAudience {
  abstract readonly audience: Audience;
}
