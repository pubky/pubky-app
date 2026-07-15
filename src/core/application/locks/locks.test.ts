import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TGuardedResource } from '@/services/locks/locks.types';
import { LocksApplication } from './locks';

const mocks = vi.hoisted(() => ({
  registerGuardedResource: vi.fn(),
  createContentLock: vi.fn(),
  randomUUID: vi.fn(),
}));

vi.mock('@/services/locks/locks', () => ({
  LocksService: {
    registerGuardedResource: mocks.registerGuardedResource,
    createContentLock: mocks.createContentLock,
  },
}));

const file = (contentType = 'application/json') => ({ contentType, bytes: new Uint8Array([1]) });
const descriptor = (path: string) => ({ path, hash: 'HASH', content_type: 'application/json', size: 1 });
/** Default builder: ignores the attachment paths and returns a fixed post JSON. */
const buildPost = () => file();

describe('LocksApplication (content)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let minted = 0;
    mocks.randomUUID.mockImplementation(() => `id-${++minted}`);
    vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: mocks.randomUUID });
    mocks.registerGuardedResource.mockImplementation(({ path }: { path: string }) => ({
      resource: descriptor(path),
      creator: 'pubkybob',
    }));
    mocks.createContentLock.mockResolvedValue({
      lock_id: 'LOCK1',
      content_lock_path: '/pub/locks.app/LOCK1.json',
      creator: 'pubkybob',
    });
  });

  it('uploads the attachments first, then the post built from their paths', async () => {
    const seen: TGuardedResource[][] = [];
    let seenOwner: string | undefined;
    const result = await LocksApplication.createLockContent({
      attachments: [file('image/png'), file('video/mp4')],
      buildPost: (attachmentResources, ownerPubky) => {
        seen.push(attachmentResources);
        seenOwner = ownerPubky;
        return file();
      },
    });

    // Attachments upload first (id-1, id-2); the post is uploaded last (id-3).
    expect(mocks.registerGuardedResource.mock.calls.map(([params]) => params.path)).toEqual(['id-1', 'id-2', 'id-3']);
    // The builder sees the attachment descriptors, so the post can reference their paths.
    expect(seen).toEqual([[descriptor('id-1'), descriptor('id-2')]]);
    // ...and the owner the bytes landed on, so those references point at the right account.
    expect(seenOwner).toBe('pubkybob');

    expect(mocks.createContentLock).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryResource: descriptor('id-3'),
        secondaryResources: [descriptor('id-1'), descriptor('id-2')],
      }),
    );
    expect(result).toEqual({ lock_id: 'LOCK1', content_lock_path: '/pub/locks.app/LOCK1.json', creator: 'pubkybob' });
  });

  it('gives identical files distinct paths, so neither overwrites the other', async () => {
    await LocksApplication.createLockContent({
      attachments: [file('image/png'), file('image/png')],
      buildPost,
    });

    const paths = mocks.registerGuardedResource.mock.calls.map(([params]) => params.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('builds the post with an empty list when there are no attachments', async () => {
    const builder = vi.fn(() => file());

    await LocksApplication.createLockContent({ buildPost: builder });

    expect(builder).toHaveBeenCalledWith([], undefined);
    expect(mocks.registerGuardedResource).toHaveBeenCalledTimes(1);
    expect(mocks.createContentLock).toHaveBeenCalledWith(expect.objectContaining({ secondaryResources: [] }));
  });

  it('sends the placeholder dev-static criterion and lock logic', async () => {
    await LocksApplication.createLockContent({ buildPost });

    const [params] = mocks.createContentLock.mock.calls[0];
    expect(params.criteria).toEqual([
      { criterion_id: 'criterion-1', verifier_type: 'dev-static', params: { satisfied: true } },
    ]);
    expect(params.lockLogic).toEqual({ type: 'all', criteria: ['criterion-1'] });
    expect(params.accessPolicy).toEqual({ requested_credential_ttl_seconds: 900 });
  });

  it('does not build the post or create the lock when an attachment upload fails', async () => {
    mocks.registerGuardedResource.mockRejectedValueOnce(new Error('upload failed'));
    const builder = vi.fn(() => file());

    await expect(
      LocksApplication.createLockContent({ attachments: [file('image/png')], buildPost: builder }),
    ).rejects.toThrow('upload failed');

    expect(builder).not.toHaveBeenCalled();
    expect(mocks.createContentLock).not.toHaveBeenCalled();
  });
});
