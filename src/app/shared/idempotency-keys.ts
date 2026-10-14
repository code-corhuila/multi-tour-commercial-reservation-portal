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

/**
 * The key of one create intention that follows the body it travels with (RN-P6, pillar 8): the same body keeps the key across
 * retries, a corrected body gets a new one, so a key is never replayed with a different payload.
 */
export class IntentionKey {
  private key: string | null = null;
  private fingerprint: string | null = null;
  constructor(private readonly keys: IdempotencyKeys) {}
  keyFor(body: unknown): string {
    const fingerprint = JSON.stringify(body);
    if (this.key === null || this.fingerprint !== fingerprint) { this.key = this.keys.generate(); this.fingerprint = fingerprint; }
    return this.key;
  }
  /** The intention is fulfilled: the next one starts with a new key. */
  settle(): void { this.key = null; this.fingerprint = null; }
}
