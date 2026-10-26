import type {
  ConnectUrlOptions,
  ExchangeFrontendSessionCodeOptions,
  RegisterGuardedResourceOptions,
  SetLockServicePointerOptions,
  VerificationTaskHandleOptions,
} from '@synonymdev/locks-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAppError } from '@/libs/error/error.utils';
import { asOpaque } from '@/test-utils/type-assertions';
import { createE2eLocksClient, createE2eLocksReads } from './locks.e2eStub';

const STUB_URL = 'http://lock-server.e2e.test';
const OWNER = 'creatorpubky';

const mocks = vi.hoisted(() => ({
  putBlob: vi.fn(async () => {}),
  getBytes: vi.fn(async () => new TextEncoder().encode('{"version":1}')),
  getLockServer: vi.fn((): string | undefined => 'lockserverpubky'),
}));

vi.mock('@/config/network', () => ({
  getLockServer: mocks.getLockServer,
}));

vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: { putBlob: mocks.putBlob, getBytes: mocks.getBytes },
}));

const fetchMock = vi.fn<typeof fetch>();

const replyWith = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

const sentTo = (call = 0) => {
  const [url, init] = fetchMock.mock.calls[call] ?? [];
  return { url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> };
};

const signIn = async () => {
  replyWith({ creator: `pubky${OWNER}` });
  const session = await createE2eLocksClient(STUB_URL).exchangeFrontendSessionCode(
    asOpaque<ExchangeFrontendSessionCodeOptions>({ code: `pubky${OWNER}`, state: 'state-1' }),
  );
  fetchMock.mockClear();
  return session;
};

describe('locks.e2eStub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the connect URL on the stub origin without a request', async () => {
    const url = await createE2eLocksClient(STUB_URL).createConnectUrl(
      asOpaque<ConnectUrlOptions>({ returnTo: 'http://localhost:3000/home', state: 'state-1' }),
    );

    expect(new URL(url).origin).toBe(STUB_URL);
    expect(new URL(url).pathname).toBe('/connect');
    expect(new URL(url).searchParams.get('state')).toBe('state-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exchanges the code for a session whose secret restores the same creator', async () => {
    replyWith({ creator: `pubky${OWNER}` });
    const client = createE2eLocksClient(STUB_URL);

    const session = await client.exchangeFrontendSessionCode(
      asOpaque<ExchangeFrontendSessionCodeOptions>({ code: `pubky${OWNER}`, state: 'state-1' }),
    );

    expect(sentTo()).toEqual({
      url: `${STUB_URL}/e2e/session/exchange`,
      body: { code: `pubky${OWNER}`, state: 'state-1' },
    });
    expect(session.creatorPubky()).toBe(`pubky${OWNER}`);
    expect(session.lockServer()).toBe('lockserverpubky');
    expect(client.restoreSession(session.exportSecret()).creatorPubky()).toBe(`pubky${OWNER}`);
  });

  it('signs out without a request, and reports no Lock Server when none is configured', async () => {
    const session = await signIn();
    mocks.getLockServer.mockReturnValueOnce(undefined);

    expect(session.lockServer()).toBe('');
    await expect(session.signout()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a secret it did not mint', () => {
    expect(() => createE2eLocksClient(STUB_URL).restoreSession('real-sdk-secret')).toThrow();
  });

  it('writes guarded bytes to the creator homeserver before registering them', async () => {
    const session = await signIn();
    replyWith({ creator: `pubky${OWNER}`, guarded_resource: { path: '/priv/app.locks/content/file-1' } });

    await session.creator.registerGuardedResource(
      asOpaque<RegisterGuardedResourceOptions>({
        path: 'file-1',
        contentType: 'image/png',
        bytes: new Uint8Array([1, 2, 3]),
      }),
    );

    expect(mocks.putBlob).toHaveBeenCalledWith({
      url: `pubky://${OWNER}/priv/app.locks/content/file-1`,
      blob: new Uint8Array([1, 2, 3]),
    });
    expect(sentTo()).toEqual({
      url: `${STUB_URL}/e2e/creator/guarded-resources`,
      body: { owner: OWNER, path: 'file-1', content_type: 'image/png', bytes: 'AQID' },
    });
  });

  it('publishes the returned lock file at its content lock path', async () => {
    const session = await signIn();
    const contentLock = { version: 1, creator: `pubky${OWNER}` };
    replyWith({ lock_id: 'lock-1', content_lock_path: '/pub/app.locks/lock-1.json', content_lock: contentLock });

    const result = await session.creator.createContentLock({ criteria: [] });

    expect(result).toEqual(expect.objectContaining({ lock_id: 'lock-1' }));
    expect(sentTo().body).toEqual({ owner: OWNER, body: { criteria: [] } });
    expect(mocks.putBlob).toHaveBeenCalledWith({
      url: `pubky://${OWNER}/pub/app.locks/lock-1.json`,
      blob: new TextEncoder().encode(JSON.stringify(contentLock)),
    });
  });

  it('sends the creator with the pointer and setup-status calls', async () => {
    const session = await signIn();
    replyWith({});
    replyWith({ status: 'ready' });

    await session.creator.setLockServicePointer(
      asOpaque<SetLockServicePointerOptions>({ defaultLockServer: 'lockserverpubky' }),
    );
    const status = await session.creator.paykitSetupStatus('BTC');

    expect(sentTo(0).body).toEqual({ owner: OWNER, default_lock_server: 'lockserverpubky' });
    expect(sentTo(1).body).toEqual({ owner: OWNER, asset: 'BTC' });
    expect(status).toEqual({ status: 'ready' });
  });

  it('routes every viewer call to the stub and decodes the guarded bytes', async () => {
    const { viewer } = createE2eLocksClient(STUB_URL);
    const handle = asOpaque<VerificationTaskHandleOptions>({ creator: `pubky${OWNER}`, bundleId: 'BUNDLE' });
    replyWith({ status: 'pending' });
    replyWith({ status: 'completed' });
    replyWith({ state: 'connected' });
    replyWith({ credential: 'cred', expires_at: '2030-01-01T00:00:00Z' });
    replyWith({ bytes: 'AQID' });

    await viewer.submitProofBundle({ bundle_id: 'BUNDLE' });
    await viewer.lookupVerificationTask(handle);
    await viewer.lookupPaykitConnectionState(handle);
    await viewer.issueAccessCredential(handle);
    const bytes = await viewer.proxyReadGuardedResource('cred', 'file-1');

    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/e2e/viewer/proof-bundles',
      '/e2e/viewer/verification-tasks',
      '/e2e/viewer/paykit-connection-state',
      '/e2e/viewer/access-credentials',
      '/e2e/viewer/guarded-resources/read',
    ]);
    expect(sentTo(1).body).toEqual({ creator: `pubky${OWNER}`, bundle_id: 'BUNDLE' });
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('keeps the SDK error message, so status mapping still applies', async () => {
    replyWith({}, 404);

    const error = await createE2eLocksClient(STUB_URL)
      .viewer.lookupVerificationTask(asOpaque<VerificationTaskHandleOptions>({ creator: OWNER, bundleId: 'X' }))
      .catch((caught: unknown) => caught);

    expect(isAppError(error)).toBe(true);
    expect((error as Error).message).toBe('Lock Server request failed with HTTP 404');
  });

  it('reads the lock file from the homeserver and Paykit presence from the stub', async () => {
    replyWith({ has_data: true });
    const reads = createE2eLocksReads(STUB_URL);

    await expect(reads.readContentLock(`${OWNER}/pub/app.locks/lock-1.json`)).resolves.toEqual({ version: 1 });
    await expect(reads.hasPaykitData('pubkyreader')).resolves.toBe(true);

    expect(mocks.getBytes).toHaveBeenCalledWith(`pubky://${OWNER}/pub/app.locks/lock-1.json`);
    expect(sentTo().body).toEqual({ user: 'pubkyreader' });
  });
});
