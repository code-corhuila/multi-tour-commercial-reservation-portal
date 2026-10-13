import { Injectable } from '@angular/core';

/**
 * Makes the Idempotency-Key of a create intention (RN-P6, D-07). Abstract so a test can tell which
 * key travelled with which request; the factory below is what the portal runs with.
 */
@Injectable({ providedIn: 'root', useFactory: () => new RandomIdempotencyKeys() })
export abstract class IdempotencyKeys {
  abstract generate(): string;
}

/** A UUID is 36 characters, inside the 8 to 128 the draft contract accepts for the header. */
class RandomIdempotencyKeys extends IdempotencyKeys {
  override generate(): string {
    return crypto.randomUUID();
  }
}
