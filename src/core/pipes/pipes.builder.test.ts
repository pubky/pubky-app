import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PubkySpecsSingleton } from './pipes.builder';
import { TEST_PUBKY } from './pipes.test-utils';

const createdPubkys = vi.hoisted(() => [] as string[]);

vi.mock('pubky-app-specs', () => ({
  PubkySpecsBuilder: class MockPubkySpecsBuilder {
    constructor(pubky: string) {
      createdPubkys.push(pubky);
    }
  },
}));

describe('PubkySpecsSingleton', () => {
  beforeEach(() => {
    createdPubkys.length = 0;
    PubkySpecsSingleton.reset();
  });

  it('reuses the builder for the same account', () => {
    const first = PubkySpecsSingleton.get(TEST_PUBKY.USER_1);
    const second = PubkySpecsSingleton.get(TEST_PUBKY.USER_1);

    expect(second).toBe(first);
    expect(createdPubkys).toEqual([TEST_PUBKY.USER_1]);
  });

  it('creates a builder for the requested account after an identity switch', () => {
    const first = PubkySpecsSingleton.get(TEST_PUBKY.USER_1);
    const second = PubkySpecsSingleton.get(TEST_PUBKY.USER_2);

    expect(second).not.toBe(first);
    expect(createdPubkys).toEqual([TEST_PUBKY.USER_1, TEST_PUBKY.USER_2]);
  });

  it('clears both the builder and its account identity on reset', () => {
    const first = PubkySpecsSingleton.get(TEST_PUBKY.USER_1);
    PubkySpecsSingleton.reset();
    const second = PubkySpecsSingleton.get(TEST_PUBKY.USER_1);

    expect(second).not.toBe(first);
    expect(createdPubkys).toEqual([TEST_PUBKY.USER_1, TEST_PUBKY.USER_1]);
  });
});
