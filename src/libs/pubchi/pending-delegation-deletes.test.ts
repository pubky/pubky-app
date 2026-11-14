import { Keypair } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import {
  PENDING_DELEGATION_DELETES_KEY,
  PENDING_DELEGATION_DELETES_MAX,
  readPendingDelegationDeletes,
  rememberPendingDelegationDeletes,
  rememberPendingDelegationDeletesPreservingOwner,
  replacePendingDelegationDeletesForOwner,
  writePendingDelegationDeletes,
} from './pending-delegation-deletes';

function z32(): string {
  return Keypair.random().publicKey.z32();
}

describe('pending delegation deletes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('drops a planted path-injection signer on read and does not rewrite it', () => {
    const owner = z32();
    localStorage.setItem(
      PENDING_DELEGATION_DELETES_KEY,
      JSON.stringify([
        { owner, signer: '../../foo' },
        { owner, signer: z32() },
      ]),
    );

    const read = readPendingDelegationDeletes();
    expect(read.every((item) => item.signer !== '../../foo')).toBe(true);
    expect(read).toHaveLength(1);
    expect(read[0]?.owner).toBe(owner);
    expect(localStorage.getItem(PENDING_DELEGATION_DELETES_KEY)).not.toContain('../../foo');
  });

  it('evicts the oldest entries once the list exceeds the cap and keeps the newest', () => {
    const owner = z32();
    const signers = Array.from({ length: PENDING_DELEGATION_DELETES_MAX + 1 }, () => z32());
    writePendingDelegationDeletes(signers.map((signer) => ({ owner, signer })));

    const read = readPendingDelegationDeletes();
    expect(read).toHaveLength(PENDING_DELEGATION_DELETES_MAX);
    expect(read.some((item) => item.signer === signers[0])).toBe(false);
    expect(read.some((item) => item.signer === signers[signers.length - 1])).toBe(true);
  });

  it('evicts entries per identity without evicting another identity', () => {
    const ownerA = z32();
    const ownerB = z32();
    const ownerASigners = Array.from({ length: PENDING_DELEGATION_DELETES_MAX + 1 }, () => z32());
    const ownerBSigner = z32();
    writePendingDelegationDeletes([
      ...ownerASigners.map((signer) => ({ owner: ownerA, signer })),
      { owner: ownerB, signer: ownerBSigner },
    ]);

    expect(readPendingDelegationDeletes(ownerA)).toHaveLength(PENDING_DELEGATION_DELETES_MAX);
    expect(readPendingDelegationDeletes(ownerA).some((item) => item.signer === ownerASigners[0])).toBe(false);
    expect(readPendingDelegationDeletes(ownerB)).toEqual([{ owner: ownerB, signer: ownerBSigner }]);
  });

  it('treats malformed JSON as an empty list', () => {
    localStorage.setItem(PENDING_DELEGATION_DELETES_KEY, '{');
    expect(readPendingDelegationDeletes()).toEqual([]);
  });

  it('dedups by owner:signer and keeps a single record', () => {
    const owner = z32();
    const signer = z32();
    rememberPendingDelegationDeletes([
      { owner, signer },
      { owner, signer },
    ]);
    expect(readPendingDelegationDeletes()).toEqual([{ owner, signer }]);
  });

  it('logs a distinct persist failure when setItem throws instead of propagating', () => {
    const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const owner = z32();
    const signer = z32();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string) => {
      if (key === PENDING_DELEGATION_DELETES_KEY) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
    });

    expect(() => rememberPendingDelegationDeletes([{ owner, signer }])).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      'Pubchi pending delegation deletes persist failed',
      expect.objectContaining({ error: expect.any(DOMException) }),
    );
  });

  it('replacePendingDelegationDeletesForOwner keeps other owners and the failed rows', () => {
    const ownerA = z32();
    const ownerB = z32();
    const signerA = z32();
    const signerB = z32();
    const signerA2 = z32();
    writePendingDelegationDeletes([
      { owner: ownerA, signer: signerA },
      { owner: ownerB, signer: signerB },
    ]);
    replacePendingDelegationDeletesForOwner(ownerA, [{ owner: ownerA, signer: signerA2 }]);
    const read = readPendingDelegationDeletes();
    expect(read).toEqual(
      expect.arrayContaining([
        { owner: ownerB, signer: signerB },
        { owner: ownerA, signer: signerA2 },
      ]),
    );
    expect(read).toHaveLength(2);
  });

  it('preserving-owner remember keeps current-owner records and keys foreign rows to their owner', () => {
    const current = z32();
    const foreign = z32();
    const currentSigner = z32();
    const foreignSigner = z32();
    writePendingDelegationDeletes([{ owner: current, signer: currentSigner }]);
    rememberPendingDelegationDeletesPreservingOwner(current, [{ owner: foreign, signer: foreignSigner }]);
    expect(readPendingDelegationDeletes()).toEqual(
      expect.arrayContaining([
        { owner: current, signer: currentSigner },
        { owner: foreign, signer: foreignSigner },
      ]),
    );
  });

  it('preserving-owner remember does not evict a full current-owner list', () => {
    const current = z32();
    const foreign = z32();
    const currentSigners = Array.from({ length: PENDING_DELEGATION_DELETES_MAX }, () => z32());
    writePendingDelegationDeletes(currentSigners.map((signer) => ({ owner: current, signer })));
    rememberPendingDelegationDeletesPreservingOwner(current, [{ owner: foreign, signer: z32() }]);
    const read = readPendingDelegationDeletes();
    expect(read).toHaveLength(PENDING_DELEGATION_DELETES_MAX);
    expect(read.every((item) => item.owner === current)).toBe(true);
  });
});
