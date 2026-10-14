import { describe, expect, it } from 'vitest';
import { IntentionKey } from '../src/app/shared/idempotency-keys';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';

describe('anIntentionKeyFollowsTheFingerprintOfTheBody', () => {
  it('reuses the key for the same body and makes a new one when the body changes', () => {
    const keys = new ControllableIdempotencyKeys(), intention = new IntentionKey(keys);
    const first = intention.keyFor({ people: 3, tour: 'a' });
    expect(intention.keyFor({ people: 3, tour: 'a' })).toBe(first);
    const second = intention.keyFor({ people: 2, tour: 'a' });
    expect(second).not.toBe(first);
    expect(intention.keyFor({ people: 2, tour: 'a' })).toBe(second);
    expect(keys.generated).toHaveLength(2);
  });
  it('makes a new key after the intention is settled', () => {
    const intention = new IntentionKey(new ControllableIdempotencyKeys());
    const first = intention.keyFor({ a: 1 });
    intention.settle();
    expect(intention.keyFor({ a: 1 })).not.toBe(first);
  });
});
