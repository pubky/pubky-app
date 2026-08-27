import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorCode, ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import type { LockFile, ReplicatedPost, TGuardedResource, TUnlockedContent } from '@/services/locks/locks.types';
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
  putBlob: vi.fn(),
  getBytes: vi.fn(),
  getBytesIfExists: vi.fn(),
  listAll: vi.fn(),
}));

vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    putBlob: mocks.putBlob,
    getBytes: mocks.getBytes,
    getBytesIfExists: mocks.getBytesIfExists,
    listAll: mocks.listAll,
  },
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
const passwordConfig = { method: 'password' } as const;

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
      lockConfig: passwordConfig,
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
      lockConfig: passwordConfig,
    });

    const paths = mocks.registerGuardedResource.mock.calls.map(([params]) => params.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('builds the post with an empty list when there are no attachments', async () => {
    const builder = vi.fn(() => file());

    await LocksApplication.createLockContent({ buildPost: builder, lockConfig: passwordConfig });

    expect(builder).toHaveBeenCalledWith([], undefined);
    expect(mocks.registerGuardedResource).toHaveBeenCalledTimes(1);
    expect(mocks.createContentLock).toHaveBeenCalledWith(expect.objectContaining({ secondaryResources: [] }));
  });

  it('sends the placeholder dev-static criterion and lock logic', async () => {
    await LocksApplication.createLockContent({ buildPost, lockConfig: passwordConfig });

    const [params] = mocks.createContentLock.mock.calls[0];
    expect(params.criteria).toEqual([
      { criterion_id: 'criterion-1', verifier_type: 'dev-static', params: { satisfied: true } },
    ]);
    expect(params.lockLogic).toEqual({ type: 'all', criteria: ['criterion-1'] });
    expect(params.accessPolicy).toEqual({ requested_credential_ttl_seconds: 900 });
  });

  it('sends the paykit-payment criterion, paying the account the post landed on', async () => {
    await LocksApplication.createLockContent({ buildPost, lockConfig: { method: 'payment', amountSats: '1234' } });

    const [params] = mocks.createContentLock.mock.calls[0];
    expect(params.criteria).toEqual([
      {
        criterion_id: 'criterion-1',
        verifier_type: 'paykit-payment',
        // The recipient comes from the upload response, not the pubky.app account.
        params: { recipient_pubky: 'pubkybob', amount: '1234', asset: 'BTC' },
      },
    ]);
    // v1 wants that single criterion referenced exactly once.
    expect(params.lockLogic).toEqual({ type: 'all', criteria: ['criterion-1'] });
  });

  it('does not build the post or create the lock when an attachment upload fails', async () => {
    mocks.registerGuardedResource.mockRejectedValueOnce(new Error('upload failed'));
    const builder = vi.fn(() => file());

    await expect(
      LocksApplication.createLockContent({
        attachments: [file('image/png')],
        buildPost: builder,
        lockConfig: passwordConfig,
      }),
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

  it.each(['failed', 'expired'] as const)(
    'throws a validation error and issues no credential when verification is %s',
    async (status) => {
      mocks.submitProofBundle.mockResolvedValue({ status: 'pending' });
      mocks.lookupVerificationTask.mockResolvedValue({ status, failure_message: 'nope' });

      await expect(LocksApplication.unlockContent({ lockFile, lockUrl, password: 'pw' })).rejects.toMatchObject({
        code: ValidationErrorCode.INVALID_INPUT,
        context: { status, failureMessage: 'nope' },
      });
      expect(mocks.issueAccessCredential).not.toHaveBeenCalled();
    },
  );

  it.each(['pending', 'in_progress'] as const)(
    'stops polling and throws a server error when the task is still %s on the last poll',
    async (status) => {
      mocks.submitProofBundle.mockResolvedValue({ status: 'pending' });
      mocks.lookupVerificationTask.mockResolvedValue({ status });

      await expect(LocksApplication.unlockContent({ lockFile, lockUrl, password: 'pw' })).rejects.toMatchObject({
        code: ServerErrorCode.SERVICE_UNAVAILABLE,
        context: { status },
      });
      expect(mocks.lookupVerificationTask).toHaveBeenCalledTimes(40); // MAX_POLL_ATTEMPTS
      expect(mocks.issueAccessCredential).not.toHaveBeenCalled();
    },
  );
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
    expect(result?.attachments).toEqual([{ id: 'img1', contentType: 'image/png', bytes: new Uint8Array([9, 9]) }]);
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

  it('rejects the whole fetch when an attachment proxy-read fails', async () => {
    const errorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});
    const post = { content: 'body', kind: 'image', attachments: ['pubky://ownerb/priv/locks.app/content/img1'] };
    mocks.proxyReadGuardedResource
      .mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify(post))) // primary
      .mockRejectedValueOnce(
        Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'proxy read failed', {
          service: ErrorService.Locks,
          operation: 'LocksService.proxyReadGuardedResource',
        }),
      );
    const lockFile = asOpaque<LockFile>({
      primary_resource: { path: '/priv/locks.app/content/p.json' },
      secondary_resources: { '/priv/locks.app/content/img1': { content_type: 'image/png', hash: 'h', size: 2 } },
    });

    // A partial resolve would get replicated and marked complete (`post.json`), freezing the missing
    // attachment out of the copy forever; the retry path only exists if this read failure surfaces.
    await expect(LocksApplication.fetchUnlockedContent({ lockFile, credential: 'cred' })).rejects.toThrow();
    // Successfully read bytes are discarded with the rejection — nothing lands on the reader HS.
    expect(mocks.putBlob).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('throws and does not read when the lock file has no readable primary resource', async () => {
    const lockFile = asOpaque<LockFile>({ primary_resource: undefined });

    await expect(LocksApplication.fetchUnlockedContent({ lockFile, credential: 'cred-abc' })).rejects.toThrow();
    expect(mocks.proxyReadGuardedResource).not.toHaveBeenCalled();
  });

  it('throws when the unlocked primary resource is not a parseable post', async () => {
    mocks.proxyReadGuardedResource.mockResolvedValue(new TextEncoder().encode('not a post'));
    const lockFile = asOpaque<LockFile>({ primary_resource: { path: '/priv/locks.app/content/a.json' } });

    // A silent null here would be indistinguishable from "no content" at the caller; must surface.
    await expect(LocksApplication.fetchUnlockedContent({ lockFile, credential: 'cred' })).rejects.toThrow();
  });
});

describe('LocksApplication.replicateUnlockedContent', () => {
  const READER = 'pubkyreader123';
  const LOCK_URL = 'pubky://pubkycreator123/pub/locks.app/LOCK1.json';
  const content: TUnlockedContent = {
    post: { content: 'secret body', kind: 'image', attachments: ['pubky://b/priv/locks.app/content/img1'] },
    attachments: [
      { id: 'img1', contentType: 'image/png', bytes: new Uint8Array([1]) },
      { id: 'img2', contentType: 'image/png', bytes: new Uint8Array([2]) },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.putBlob.mockResolvedValue(undefined);
  });

  it('uploads every attachment before post.json, so the marker only lands once they are stored', async () => {
    await LocksApplication.replicateUnlockedContent({ lockUrl: LOCK_URL, readerPubky: READER, content });

    const urls = mocks.putBlob.mock.calls.map(([params]) => params.url);
    expect(urls).toEqual([
      `pubky://${READER}/priv/social/unlocked/LOCK1/img1`,
      `pubky://${READER}/priv/social/unlocked/LOCK1/img2`,
      `pubky://${READER}/priv/social/unlocked/LOCK1/post.json`,
    ]);
  });

  it('repoints attachments in post.json at the reader copy with inline content types', async () => {
    await LocksApplication.replicateUnlockedContent({ lockUrl: LOCK_URL, readerPubky: READER, content });

    const postCall = mocks.putBlob.mock.calls.at(-1)?.[0];
    expect(JSON.parse(new TextDecoder().decode(postCall.blob))).toEqual({
      content: 'secret body',
      kind: 'image',
      attachments: [
        { url: `pubky://${READER}/priv/social/unlocked/LOCK1/img1`, content_type: 'image/png' },
        { url: `pubky://${READER}/priv/social/unlocked/LOCK1/img2`, content_type: 'image/png' },
      ],
    });
  });

  it('throws without uploading when the lock URL carries no lock id', async () => {
    await expect(
      LocksApplication.replicateUnlockedContent({
        lockUrl: 'pubky://creator/pub/locks.app/',
        readerPubky: READER,
        content,
      }),
    ).rejects.toThrow();
    expect(mocks.putBlob).not.toHaveBeenCalled();
  });
});

describe('LocksApplication.fetchReplicatedAttachments', () => {
  const post = (contentTypes: string[]) =>
    asOpaque<ReplicatedPost>({
      content: 'body',
      kind: 'image',
      attachments: contentTypes.map((content_type, index) => ({
        url: `pubky://reader/priv/social/unlocked/LOCK1/file${index}`,
        content_type,
      })),
    });

  beforeEach(() => vi.clearAllMocks());

  it('drops an attachment the replica no longer has and keeps the rest renderable', async () => {
    mocks.getBytes
      .mockResolvedValueOnce(new Uint8Array([1]))
      .mockRejectedValueOnce(
        Err.client(ClientErrorCode.NOT_FOUND, 'gone', { service: ErrorService.Homeserver, operation: 'getBytes' }),
      )
      .mockResolvedValueOnce(new Uint8Array([3]));

    const result = await LocksApplication.fetchReplicatedAttachments({
      post: post(['image/png', 'image/png', 'image/png']),
    });

    expect(result.map((attachment) => attachment.id)).toEqual(['file0', 'file2']);
  });

  it('rejects on a transient failure, so an outage is not shown as missing media', async () => {
    mocks.getBytes.mockRejectedValueOnce(
      Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'homeserver down', {
        service: ErrorService.Homeserver,
        operation: 'getBytes',
      }),
    );

    await expect(LocksApplication.fetchReplicatedAttachments({ post: post(['image/png']) })).rejects.toThrow();
  });
});

describe('LocksApplication.fetchReplicatedContent', () => {
  const READER = 'pubkyreader123';
  const LOCK_URL = 'pubky://pubkycreator123/pub/locks.app/LOCK1.json';
  const marker = (value: unknown, modifiedAt = 1) => ({
    bytes: new TextEncoder().encode(JSON.stringify(value)),
    modifiedAt,
  });

  beforeEach(() => vi.clearAllMocks());

  it('returns null (not unlocked) when the post.json marker is absent (404 → null, no error)', async () => {
    mocks.getBytesIfExists.mockResolvedValueOnce(null);

    const result = await LocksApplication.fetchReplicatedContent({ lockUrl: LOCK_URL, readerPubky: READER });

    expect(result).toBeNull();
    expect(mocks.getBytesIfExists).toHaveBeenCalledWith(`pubky://${READER}/priv/social/unlocked/LOCK1/post.json`);
  });

  it('loads the replicated post and its attachments from the reader priv (no lock file needed)', async () => {
    const attachmentUrl = `pubky://${READER}/priv/social/unlocked/LOCK1/img1`;
    mocks.getBytesIfExists.mockResolvedValueOnce(
      marker({ content: 'secret', kind: 'image', attachments: [{ url: attachmentUrl, content_type: 'image/png' }] }),
    );
    mocks.getBytes.mockResolvedValueOnce(new Uint8Array([7, 7]));

    const result = await LocksApplication.fetchReplicatedContent({ lockUrl: LOCK_URL, readerPubky: READER });

    expect(result?.post).toEqual({ content: 'secret', kind: 'image', attachments: [attachmentUrl] });
    expect(result?.attachments).toEqual([{ id: 'img1', contentType: 'image/png', bytes: new Uint8Array([7, 7]) }]);
    expect(mocks.getBytes).toHaveBeenCalledWith(attachmentUrl);
  });

  it('throws when the marker exists but is not a parseable post (data corruption, not "not unlocked")', async () => {
    mocks.getBytesIfExists.mockResolvedValueOnce({ bytes: new TextEncoder().encode('not json'), modifiedAt: 1 });

    await expect(LocksApplication.fetchReplicatedContent({ lockUrl: LOCK_URL, readerPubky: READER })).rejects.toThrow();
  });
});

describe('LocksApplication.fetchUnlockedList', () => {
  const READER = 'pubkyreader123';
  const markerUrl = (lockId: string) => `pubky://${READER}/priv/social/unlocked/${lockId}/post.json`;
  const marker = (content: string, modifiedAt: number | null) => ({
    bytes: new TextEncoder().encode(JSON.stringify({ content, kind: 'short', attachments: null })),
    modifiedAt,
  });

  beforeEach(() => vi.clearAllMocks());

  it('drops only the corrupt marker and returns the healthy items newest first', async () => {
    mocks.listAll.mockResolvedValueOnce([markerUrl('LOCK1'), markerUrl('LOCK2'), markerUrl('LOCK3')]);
    mocks.getBytesIfExists
      .mockResolvedValueOnce(marker('a', 1))
      .mockResolvedValueOnce({ bytes: new TextEncoder().encode('not json'), modifiedAt: 2 }) // LOCK2 corrupt
      .mockResolvedValueOnce(marker('c', 3)); // LOCK3

    const result = await LocksApplication.fetchUnlockedList({ readerPubky: READER });

    expect(result.map((item) => item.lockId)).toEqual(['LOCK3', 'LOCK1']);
  });

  it('sorts by the homeserver write time', async () => {
    mocks.listAll.mockResolvedValueOnce([markerUrl('OLD'), markerUrl('NEW')]);
    mocks.getBytesIfExists.mockResolvedValueOnce(marker('old', 100)).mockResolvedValueOnce(marker('new', 900));

    const result = await LocksApplication.fetchUnlockedList({ readerPubky: READER });

    expect(result.map((item) => [item.lockId, item.unlockedAt])).toEqual([
      ['NEW', 900],
      ['OLD', 100],
    ]);
  });

  it('sorts a marker with no Last-Modified header oldest instead of dropping it', async () => {
    mocks.listAll.mockResolvedValueOnce([markerUrl('NOHEADER'), markerUrl('DATED')]);
    mocks.getBytesIfExists.mockResolvedValueOnce(marker('a', null)).mockResolvedValueOnce(marker('b', 5));

    const result = await LocksApplication.fetchUnlockedList({ readerPubky: READER });

    expect(result.map((item) => item.lockId)).toEqual(['DATED', 'NOHEADER']);
  });
});

describe('LocksApplication.fetchOwnContent', () => {
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  const ownLockFile = asOpaque<LockFile>({
    creator: 'pubkyowner', // stripPubkyPrefix → 'owner' is the read host (see the test below)
    primary_resource: {
      path: '/priv/locks.app/content/post',
      hash: 'h',
      content_type: 'application/octet-stream',
      size: 1,
    },
    secondary_resources: { '/priv/locks.app/content/img1': { content_type: 'image/png', hash: 'h', size: 2 } },
  });

  beforeEach(() => vi.clearAllMocks());

  it('reads the guarded original directly from the owner homeserver (no credential/proxy)', async () => {
    // `stripPubkyPrefix('pubkyowner')` → 'owner', the host for the primary read.
    const attachmentUri = 'pubky://owner/priv/locks.app/content/img1';
    mocks.getBytes
      .mockResolvedValueOnce(encode({ content: 'my secret', kind: 'image', attachments: [attachmentUri] }))
      .mockResolvedValueOnce(new Uint8Array([5, 5]));

    const result = await LocksApplication.fetchOwnContent({ lockFile: ownLockFile });

    expect(mocks.getBytes).toHaveBeenNthCalledWith(1, 'pubky://owner/priv/locks.app/content/post');
    expect(mocks.getBytes).toHaveBeenNthCalledWith(2, attachmentUri);
    expect(result?.post).toEqual({ content: 'my secret', kind: 'image', attachments: [attachmentUri] });
    expect(result?.attachments).toEqual([{ id: 'img1', contentType: 'image/png', bytes: new Uint8Array([5, 5]) }]);
    expect(mocks.proxyReadGuardedResource).not.toHaveBeenCalled();
  });

  it('throws (data error, reported) when the lock file has no primary resource', async () => {
    await expect(
      LocksApplication.fetchOwnContent({
        lockFile: asOpaque<LockFile>({ creator: 'pubkyowner', primary_resource: undefined, secondary_resources: {} }),
      }),
    ).rejects.toThrow();
    expect(mocks.getBytes).not.toHaveBeenCalled();
  });

  it('throws (data error) when the guarded original is not a parseable post', async () => {
    mocks.getBytes.mockResolvedValueOnce(new TextEncoder().encode('not json'));

    await expect(LocksApplication.fetchOwnContent({ lockFile: ownLockFile })).rejects.toThrow();
  });

  it('rejects the whole fetch when an attachment direct read fails', async () => {
    const attachmentUri = 'pubky://owner/priv/locks.app/content/img1';
    mocks.getBytes
      .mockResolvedValueOnce(encode({ content: 'my secret', kind: 'image', attachments: [attachmentUri] }))
      .mockRejectedValueOnce(new Error('network down'));

    await expect(LocksApplication.fetchOwnContent({ lockFile: ownLockFile })).rejects.toThrow();
  });
});
