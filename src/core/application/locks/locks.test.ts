import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import type { LockFile, TGuardedResource } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { LocksApplication } from './locks';

const mocks = vi.hoisted(() => ({
  registerGuardedResource: vi.fn(),
  createContentLock: vi.fn(),
  randomUUID: vi.fn(),
  generateBundleId: vi.fn(),
  submitProofBundle: vi.fn(),
  lookupVerificationTask: vi.fn(),
  issueAccessCredential: vi.fn(),
  readContentLock: vi.fn(),
  proxyReadGuardedResource: vi.fn(),
}));

vi.mock('@/services/locks/locks', () => ({
  LocksService: {
    registerGuardedResource: mocks.registerGuardedResource,
    createContentLock: mocks.createContentLock,
    generateBundleId: mocks.generateBundleId,
    submitProofBundle: mocks.submitProofBundle,
    lookupVerificationTask: mocks.lookupVerificationTask,
    issueAccessCredential: mocks.issueAccessCredential,
    readContentLock: mocks.readContentLock,
    proxyReadGuardedResource: mocks.proxyReadGuardedResource,
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
const VALID_LOCK_URL = 'pubky://8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo/pub/locks.app/lock1.json';

const lockFile: LockFile = {
  version: 1,
  creator: 'pubkybob',
  primary_resource: { path: '/priv/locks.app/content/x', hash: 'h', content_type: 'application/octet-stream', size: 1 },
  secondary_resources: {},
  criteria: [{ criterion_id: 'c1', verifier_type: 'password', params: {} }],
  lock_logic: { type: 'all', criteria: ['c1'] },
  access_policy: { requested_credential_ttl_seconds: 900 },
  lock_server: { override: 'pubkyserver' },
};

describe('LocksApplication.fetchLockFile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws a validation error for a malformed lock url (the single failure origin)', async () => {
    await expect(LocksApplication.fetchLockFile({ lockUrl: 'https://example.com/lock.json' })).rejects.toThrow();
    expect(mocks.readContentLock).not.toHaveBeenCalled();
  });

  it('reads the public lock.json through the SDK for a valid lock url', async () => {
    mocks.readContentLock.mockResolvedValue(lockFile);

    const result = await LocksApplication.fetchLockFile({ lockUrl: VALID_LOCK_URL });

    expect(mocks.readContentLock).toHaveBeenCalledWith(VALID_LOCK_URL);
    expect(result).toBe(lockFile);
  });
});

describe('LocksApplication (reader unlock)', () => {
  const lockFile = {
    version: 1,
    creator: 'pubkybob',
    secondary_resources: {},
    criteria: [{ criterion_id: 'criterion-1', verifier_type: 'dev-static', params: {} }],
    lock_logic: { type: 'all', criteria: ['criterion-1'] },
    access_policy: { requested_credential_ttl_seconds: 900 },
    lock_server: { override: 'server1' },
  } as LockFile;
  const lockUrl = 'pubky://pubkybob/pub/locks.app/LOCK1.json';

  beforeEach(() => {
    vi.clearAllMocks();
    // Skip the real poll delay so tests don't wait on timers.
    vi.spyOn(asOpaque<{ wait: (ms: number) => Promise<void> }>(LocksApplication), 'wait').mockResolvedValue(undefined);
    mocks.generateBundleId.mockResolvedValue('bundle-1');
    mocks.issueAccessCredential.mockResolvedValue({ credential: 'cred-abc', expires_at: '2026-01-01' });
  });

  it('mints a bundle, submits the proof, polls to completed, and returns the credential', async () => {
    mocks.submitProofBundle.mockResolvedValue({ status: 'pending' });
    mocks.lookupVerificationTask.mockResolvedValue({ status: 'completed' });

    const result = await LocksApplication.unlockContent({ lockFile, lockUrl, password: 'hunter2' });

    expect(mocks.submitProofBundle).toHaveBeenCalledWith(
      expect.objectContaining({ bundle_id: 'bundle-1', pubky_lock_resource: 'pubkybob/pub/locks.app/LOCK1.json' }),
      'hunter2',
    );
    expect(mocks.lookupVerificationTask).toHaveBeenCalledWith('pubkybob', 'bundle-1');
    expect(result).toEqual({ bundleId: 'bundle-1', credential: 'cred-abc', expiresAt: '2026-01-01' });
  });

  it('issues the credential without polling when submit already reports completed', async () => {
    mocks.submitProofBundle.mockResolvedValue({ status: 'completed' });

    await LocksApplication.unlockContent({ lockFile, lockUrl, password: 'pw' });

    expect(mocks.lookupVerificationTask).not.toHaveBeenCalled();
    expect(mocks.issueAccessCredential).toHaveBeenCalledWith('pubkybob', 'bundle-1');
  });

  it('throws and does not issue a credential when verification fails', async () => {
    mocks.submitProofBundle.mockResolvedValue({ status: 'pending' });
    mocks.lookupVerificationTask.mockResolvedValue({ status: 'failed', failure_message: 'nope' });

    await expect(LocksApplication.unlockContent({ lockFile, lockUrl, password: 'pw' })).rejects.toThrow();
    expect(mocks.issueAccessCredential).not.toHaveBeenCalled();
  });
});

describe('LocksApplication.fetchUnlockedContent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the primary resource with the derived path and parses the post (no attachments)', async () => {
    const post = { content: 'secret body', kind: 'short', attachments: null };
    mocks.proxyReadGuardedResource.mockResolvedValue(new TextEncoder().encode(JSON.stringify(post)));
    const lockFile = asOpaque<LockFile>({ primary_resource: { path: '/priv/locks.app/content/a.json' } });

    const result = await LocksApplication.fetchUnlockedContent({ lockFile, credential: 'cred-abc' });

    expect(mocks.proxyReadGuardedResource).toHaveBeenCalledWith('cred-abc', 'a.json');
    expect(result).toEqual({ post, attachments: [] });
  });

  it('proxy-reads each attachment with its content type from the lock file', async () => {
    const post = { content: 'body', kind: 'image', attachments: ['pubky://ownerb/priv/locks.app/content/img1'] };
    mocks.proxyReadGuardedResource
      .mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify(post))) // primary
      .mockResolvedValueOnce(new Uint8Array([9, 9])); // attachment
    const lockFile = asOpaque<LockFile>({
      primary_resource: { path: '/priv/locks.app/content/p.json' },
      secondary_resources: { '/priv/locks.app/content/img1': { content_type: 'image/png', hash: 'h', size: 2 } },
    });

    const result = await LocksApplication.fetchUnlockedContent({ lockFile, credential: 'cred' });

    expect(mocks.proxyReadGuardedResource).toHaveBeenNthCalledWith(1, 'cred', 'p.json');
    expect(mocks.proxyReadGuardedResource).toHaveBeenNthCalledWith(2, 'cred', 'img1');
    expect(result?.attachments).toEqual([{ contentType: 'image/png', bytes: new Uint8Array([9, 9]) }]);
  });

  it('reports and drops an attachment (no read) when the lock file has no descriptor for it', async () => {
    const errorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});
    const post = { content: 'body', kind: 'image', attachments: ['pubky://ownerb/priv/locks.app/content/missing'] };
    mocks.proxyReadGuardedResource.mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify(post)));
    const lockFile = asOpaque<LockFile>({
      primary_resource: { path: '/priv/locks.app/content/p.json' },
      secondary_resources: {},
    });

    const result = await LocksApplication.fetchUnlockedContent({ lockFile, credential: 'cred' });

    expect(result?.attachments).toEqual([]);
    expect(mocks.proxyReadGuardedResource).toHaveBeenCalledTimes(1); // primary only, attachment dropped
    expect(errorSpy).toHaveBeenCalled(); // permanent data error reported to Sentry via the Err factory
    errorSpy.mockRestore();
  });

  it('throws and does not read when the lock file has no readable primary resource', async () => {
    const lockFile = asOpaque<LockFile>({ primary_resource: undefined });

    await expect(LocksApplication.fetchUnlockedContent({ lockFile, credential: 'cred-abc' })).rejects.toThrow();
    expect(mocks.proxyReadGuardedResource).not.toHaveBeenCalled();
  });
});
