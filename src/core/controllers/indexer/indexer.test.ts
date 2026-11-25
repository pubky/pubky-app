import { describe, expect, it, vi } from 'vitest';
import { IndexerApplication } from '@/application/indexer/indexer';
import type { Pubky } from '@/models/models.types';
import { IndexerController } from './indexer';

vi.mock('@/application/indexer/indexer', () => ({
  IndexerApplication: { clear: vi.fn(), refresh: vi.fn() },
}));

const ALICE = 'alice-pubky' as Pubky;

describe('IndexerController.discardLocalIndex', () => {
  it('deletes the account’s index without waiting, and swallows a failure', async () => {
    let fail: (error: unknown) => void = () => {};
    vi.mocked(IndexerApplication.clear).mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
    );

    expect(IndexerController.discardLocalIndex(ALICE)).toBeUndefined();
    fail(new DOMException('blocked', 'UnknownError'));
    await Promise.resolve();

    expect(IndexerApplication.clear).toHaveBeenCalledExactlyOnceWith(ALICE);
  });
});

describe('IndexerController.syncLocalIndexNow', () => {
  it('syncs without waiting, and swallows a failure', async () => {
    vi.mocked(IndexerApplication.refresh).mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));

    expect(IndexerController.syncLocalIndexNow()).toBeUndefined();
    await Promise.resolve();

    expect(IndexerApplication.refresh).toHaveBeenCalledOnce();
  });
});
