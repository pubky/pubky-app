import type { Session } from '@synonymdev/pubky';
import type { LastReadResult } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksApplication } from '@/application/locks/locks';
import { ProfileApplication } from '@/application/profile/profile';
import { SettingsApplication } from '@/application/settings/settings';
import { TagApplication } from '@/application/tag/tag';
import { TagKind } from '@/application/tag/tag.types';
import { NotificationController } from '@/controllers/notification/notification';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import { LastReadNormalizer } from '@/pipes/lastRead/lastRead.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import {
  HOMESERVER_PUBLISH_CONFLICT_MESSAGE,
  installHomeserverWriteRetryDependenciesForTests,
} from '@/services/homeserver/write-retry';
import { LocksService } from '@/services/locks/locks';
import type { LockFile } from '@/services/locks/locks.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useNotificationStore } from '@/stores/notification/notification.store';
import {
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  type SettingsState,
} from '@/stores/settings/settings.types';
import { asOpaque } from '@/test-utils/type-assertions';

// A homeserver in memory behind the SDK boundary; HomeserverService, the applications,
// the normalizers, the stores and IndexedDB are real.
const homeserver = vi.hoisted(() => ({
  files: new Map<string, string>(),
  putJson: vi.fn<(path: string, body: unknown) => Promise<void>>(),
  putBytes: vi.fn<(path: string, bytes: Uint8Array) => Promise<void>>(),
  delete: vi.fn<(path: string) => Promise<void>>(),
  /** Each write as it reaches the SDK, with whether logout had begun. */
  writes: [] as { op: string; path: string; isLoggingOut: boolean }[],
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@synonymdev/pubky', () => {
  const read = (path: string) =>
    homeserver.files.has(path)
      ? new Response(homeserver.files.get(path), { status: 200 })
      : new Response('Not found', { status: 404 });
  const createSdk = () => ({
    client: { fetch: async (url: string) => read(url.replace(/^pubky:\/\/[^/]+/, '')) },
    publicStorage: { get: vi.fn(), exists: vi.fn(), list: vi.fn() },
  });
  const MockPubky = vi.fn().mockImplementation(createSdk);
  // @ts-expect-error testnet is a static constructor on the SDK class
  MockPubky.testnet = vi.fn().mockImplementation(createSdk);
  // @ts-expect-error withClient is a static constructor on the SDK class
  MockPubky.withClient = vi.fn().mockImplementation(createSdk);
  return { Pubky: MockPubky, Client: vi.fn(), resolvePubky: (url: string) => url };
});

const USER = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
const PROFILE_PATH = '/pub/pubky.app/profile.json';
const LAST_READ_PATH = '/pub/pubky.app/last_read';

function logWrite(op: string, path: string) {
  homeserver.writes.push({ op, path, isLoggingOut: useAuthStore.getState().isLoggingOut });
}

function session(): Session {
  return asOpaque<Session>({
    info: { publicKey: { z32: () => USER } },
    storage: {
      putJson: (path: string, body: unknown) => {
        logWrite('PUT', path);
        return homeserver.putJson(path, body);
      },
      get: async (path: string) =>
        homeserver.files.has(path)
          ? new Response(homeserver.files.get(path), { status: 200 })
          : new Response('Not found', { status: 404 }),
      exists: async (path: string) => homeserver.files.has(path),
      putBytes: (path: string, bytes: Uint8Array) => {
        logWrite('PUT', path);
        return homeserver.putBytes(path, bytes);
      },
      delete: (path: string) => {
        logWrite('DELETE', path);
        return homeserver.delete(path);
      },
      list: async (dir: string) =>
        [...homeserver.files.keys()].filter((path) => path.startsWith(dir)).map((path) => `pubky://${USER}${path}`),
    },
  });
}

function sdkError(statusCode: number): Error {
  const body = statusCode === 409 ? `Conflict - ${HOMESERVER_PUBLISH_CONFLICT_MESSAGE}` : 'Error';
  return Object.assign(new Error(`Request failed: Server responded with an error: ${statusCode} ${body}`), {
    name: 'RequestError',
    data: { statusCode },
  });
}

/** Runs during each retry backoff, between a rejected attempt and the next one. */
let onBackoff: (() => void | Promise<void>) | undefined;

beforeEach(async () => {
  homeserver.files.clear();
  homeserver.writes = [];
  homeserver.putJson.mockReset().mockImplementation(async (path, body) => {
    homeserver.files.set(path, JSON.stringify(body));
  });
  homeserver.putBytes.mockReset().mockImplementation(async (path, bytes) => {
    homeserver.files.set(path, new TextDecoder().decode(bytes));
  });
  homeserver.delete.mockReset().mockImplementation(async (path) => {
    homeserver.files.delete(path);
  });
  onBackoff = undefined;
  installHomeserverWriteRetryDependenciesForTests({
    sleep: async () => {
      await onBackoff?.();
    },
    random: () => 0,
  });
  useAuthStore.setState({
    session: session(),
    currentUserPubky: USER,
    generation: 'generation-1',
    restoreStatus: 'ready',
    sessionReference: null,
    isLoggingOut: false,
  });
  await UserDetailsModel.table.clear();
  await UserTtlModel.table.clear();
});

afterEach(() => {
  installHomeserverWriteRetryDependenciesForTests(null);
  useAuthStore.setState({ session: null, currentUserPubky: null, generation: '', isLoggingOut: false });
  vi.restoreAllMocks();
});

const putsTo = (path: string) =>
  homeserver.putJson.mock.calls.filter(([putPath]) => putPath === path).map(([, body]) => body);

describe('a profile edit that the homeserver refuses re-reads before retrying', () => {
  const published = {
    name: 'Alice',
    bio: 'old bio',
    image: `pubky://${USER}/pub/pubky.app/files/0035S78QPP4S0`,
    links: [{ title: 'WEBSITE', url: 'https://example.com/' }],
    status: 'working',
  };

  it.each([429, 500, 503, 409])('keeps a bio another device saved during the backoff after a %i', async (status) => {
    homeserver.files.set(PROFILE_PATH, JSON.stringify(published));
    homeserver.putJson.mockRejectedValueOnce(sdkError(status));
    onBackoff = () => {
      homeserver.files.set(PROFILE_PATH, JSON.stringify({ ...published, bio: 'new bio from device B' }));
    };

    await ProfileApplication.commitUpdateStatus({ pubky: USER, status: 'back' });

    expect(putsTo(PROFILE_PATH)).toEqual([
      expect.objectContaining({ bio: 'old bio', status: 'back' }),
      expect.objectContaining({ bio: 'new bio from device B', status: 'back' }),
    ]);
    expect(JSON.parse(homeserver.files.get(PROFILE_PATH)!)).toMatchObject({
      bio: 'new bio from device B',
      status: 'back',
    });
    expect(await UserDetailsModel.findById(USER)).toMatchObject({ bio: 'new bio from device B', status: 'back' });
  });

  it('does not write again once logout begins during the backoff', async () => {
    homeserver.files.set(PROFILE_PATH, JSON.stringify(published));
    homeserver.putJson.mockRejectedValueOnce(sdkError(503));
    onBackoff = () => {
      useAuthStore.setState({ isLoggingOut: true });
    };

    await expect(ProfileApplication.commitUpdateStatus({ pubky: USER, status: 'back' })).rejects.toMatchObject({
      code: AuthErrorCode.SESSION_EXPIRED,
    });
    expect(homeserver.putJson).toHaveBeenCalledOnce();
  });
});

describe('a settings write that the homeserver refuses with the publish conflict', () => {
  const settings: SettingsState = {
    notifications: defaultNotificationPreferences,
    privacy: { ...defaultPrivacyPreferences, moderationBot: 'euwmq57zefw5ynnkhh37b3gcmhs7g3cptdbw1doaxj1pbmzp3wro' },
    muted: [],
    updatedAt: 1_700_000_000_000,
    version: 1,
  };

  it('rejects instead of writing again when logout begins and the caller aborts during the backoff', async () => {
    const controller = new AbortController();
    homeserver.putJson.mockRejectedValueOnce(sdkError(409));
    onBackoff = () => {
      controller.abort();
      useAuthStore.setState({ isLoggingOut: true });
    };

    await expect(SettingsApplication.commitUpdate(settings, USER, controller.signal)).rejects.toMatchObject({
      code: AuthErrorCode.SESSION_EXPIRED,
    });
    expect(homeserver.putJson).toHaveBeenCalledOnce();
  });

  it('stops without writing again when only the caller aborts during the backoff', async () => {
    const controller = new AbortController();
    homeserver.putJson.mockRejectedValueOnce(sdkError(409));
    onBackoff = () => controller.abort();

    await expect(SettingsApplication.commitUpdate(settings, USER, controller.signal)).resolves.toBeUndefined();
    expect(homeserver.putJson).toHaveBeenCalledOnce();
  });

  it('rejects instead of adopting a replacement session for the same account', async () => {
    homeserver.putJson.mockRejectedValueOnce(sdkError(409));
    onBackoff = () => {
      useAuthStore.setState({ session: session() });
    };

    await expect(SettingsApplication.commitUpdate(settings, USER)).rejects.toMatchObject({
      code: AuthErrorCode.SESSION_EXPIRED,
    });
    expect(homeserver.putJson).toHaveBeenCalledOnce();
  });
});

describe('marking notifications read never moves last_read backward', () => {
  const T1 = 1_000;
  const T2 = 2_000;
  const lastRead = (timestamp: number) =>
    asOpaque<LastReadResult>({
      last_read: { timestamp: BigInt(timestamp), toJson: () => ({ timestamp }) },
      meta: { url: `pubky://${USER}${LAST_READ_PATH}` },
      free: vi.fn(),
    });

  beforeEach(() => {
    useNotificationStore.getState().setLastRead(0);
    useNotificationStore.getState().setUnread(3);
  });

  it('holds a retried mark, lets a later one finish, and keeps both markers at the later time', async () => {
    vi.spyOn(LastReadNormalizer, 'to').mockReturnValueOnce(lastRead(T1)).mockReturnValueOnce(lastRead(T2));
    let releaseA!: () => void;
    homeserver.putJson.mockRejectedValueOnce(sdkError(429));
    onBackoff = () =>
      new Promise<void>((resolve) => {
        releaseA = resolve;
      });

    const a = NotificationController.markAllAsRead();
    await vi.waitFor(() => expect(releaseA).toBeTypeOf('function'));
    const b = NotificationController.markAllAsRead();
    releaseA();
    await Promise.all([a, b]);

    expect(putsTo(LAST_READ_PATH)).toEqual([{ timestamp: T1 }, { timestamp: T1 }, { timestamp: T2 }]);
    expect(JSON.parse(homeserver.files.get(LAST_READ_PATH)!)).toEqual({ timestamp: T2 });
    expect(useNotificationStore.getState().lastRead).toBe(T2);
  });

  it('keeps a newer acknowledgment another tab saved while the retry waited, remotely and locally', async () => {
    vi.spyOn(LastReadNormalizer, 'to').mockReturnValueOnce(lastRead(T1));
    homeserver.putJson.mockRejectedValueOnce(sdkError(503));
    onBackoff = () => {
      homeserver.files.set(LAST_READ_PATH, JSON.stringify({ timestamp: T2 }));
    };

    await NotificationController.markAllAsRead();

    expect(putsTo(LAST_READ_PATH)).toEqual([{ timestamp: T1 }]);
    expect(JSON.parse(homeserver.files.get(LAST_READ_PATH)!)).toEqual({ timestamp: T2 });
    expect(useNotificationStore.getState().lastRead).toBe(T2);
  });

  it('sends no queued mark once logout begins while it waits behind a retrying one', async () => {
    vi.spyOn(LastReadNormalizer, 'to').mockReturnValueOnce(lastRead(T1)).mockReturnValueOnce(lastRead(T2));
    let releaseA!: () => void;
    homeserver.putJson.mockRejectedValueOnce(sdkError(503));
    onBackoff = () =>
      new Promise<void>((resolve) => {
        releaseA = resolve;
      });

    const a = NotificationController.markAllAsRead();
    await vi.waitFor(() => expect(releaseA).toBeTypeOf('function'));
    const b = NotificationController.markAllAsRead();
    // Logout keeps the session while it saves the signed-out state.
    useAuthStore.setState({ isLoggingOut: true });
    releaseA();
    await Promise.all([a, b]);

    expect(homeserver.writes.filter(({ path }) => path === LAST_READ_PATH).map((w) => w.isLoggingOut)).toEqual([false]);
    expect(homeserver.files.has(LAST_READ_PATH)).toBe(false);
  });

  it('does not let a queued mark overwrite a newer marker another device saved meanwhile', async () => {
    const T3 = 3_000;
    vi.spyOn(LastReadNormalizer, 'to').mockReturnValueOnce(lastRead(T1)).mockReturnValueOnce(lastRead(T2));
    let releaseA!: () => void;
    homeserver.putJson.mockRejectedValueOnce(sdkError(503));
    onBackoff = () =>
      new Promise<void>((resolve) => {
        releaseA = resolve;
      });

    const a = NotificationController.markAllAsRead();
    await vi.waitFor(() => expect(releaseA).toBeTypeOf('function'));
    const b = NotificationController.markAllAsRead();
    homeserver.files.set(LAST_READ_PATH, JSON.stringify({ timestamp: T3 }));
    releaseA();
    await Promise.all([a, b]);

    expect(putsTo(LAST_READ_PATH)).toEqual([{ timestamp: T1 }]);
    expect(JSON.parse(homeserver.files.get(LAST_READ_PATH)!)).toEqual({ timestamp: T3 });
    expect(useNotificationStore.getState().lastRead).toBe(T3);
  });
});

describe('writes to one tag run in the order the user made them', () => {
  const POST_ID = `${USER}:0033SSE3B1FQ0` as Pubky;
  const TAG_PATH = '/pub/pubky.app/tags/TAG0001';
  const tag = {
    taggerId: USER,
    taggedId: POST_ID,
    label: 'bitcoin',
    taggedKind: TagKind.POST,
    tagUrl: `pubky://${USER}${TAG_PATH}`,
  };
  const tagJson = { uri: `pubky://${USER}/pub/pubky.app/posts/0033SSE3B1FQ0`, label: 'bitcoin', created_at: 1 };
  const tagOps = () => homeserver.writes.filter(({ path }) => path === TAG_PATH).map(({ op }) => op);

  it('keeps a tag removed while its add was retrying removed', async () => {
    let failAdd!: () => void;
    homeserver.putJson.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          failAdd = () => reject(sdkError(503));
        }),
    );

    const request = vi.spyOn(HomeserverService, 'request');
    const add = TagApplication.commitCreate({ tagList: [{ ...tag, tagJson }] });
    await vi.waitFor(() => expect(failAdd).toBeTypeOf('function'));
    const remove = TagApplication.commitDelete(tag);
    // The removal has reached the homeserver service before the add's first attempt fails.
    await vi.waitFor(() =>
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: HttpMethod.DELETE })),
    );
    failAdd();
    await Promise.all([add, remove]);

    expect(tagOps()).toEqual(['PUT', 'PUT', 'DELETE']);
    expect(homeserver.files.has(TAG_PATH)).toBe(false);
  });

  it('keeps a tag added back while its removal was retrying present', async () => {
    homeserver.files.set(TAG_PATH, JSON.stringify(tagJson));
    await TagApplication.commitCreate({ tagList: [{ ...tag, tagJson }] });
    homeserver.writes = [];
    let releaseRemove!: () => void;
    homeserver.delete.mockRejectedValueOnce(sdkError(429));
    onBackoff = () =>
      new Promise<void>((resolve) => {
        releaseRemove = resolve;
      });

    const request = vi.spyOn(HomeserverService, 'request');
    const remove = TagApplication.commitDelete(tag);
    await vi.waitFor(() => expect(releaseRemove).toBeTypeOf('function'));
    const add = TagApplication.commitCreate({ tagList: [{ ...tag, tagJson }] });
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: HttpMethod.PUT })));
    expect(tagOps()).toEqual(['DELETE']);
    releaseRemove();
    await Promise.all([remove, add]);

    expect(tagOps()).toEqual(['DELETE', 'DELETE', 'PUT']);
    expect(homeserver.files.has(TAG_PATH)).toBe(true);
  });
});

describe('a lock payment retry that reuses a saved bundle', () => {
  const BUNDLE = 'A'.repeat(26);
  const lockFile = asOpaque<LockFile>({
    creator: 'pubkybob',
    criteria: [
      { criterion_id: 'criterion-1', verifier_type: 'paykit-payment', params: { amount: '1000', asset: 'BTC' } },
    ],
  });
  const lockUrl = 'pubky://pubkybob/pub/app.locks/LOCK1.json';
  const savedPurchase = `/priv/social/purchases/LOCK1/${BUNDLE}.json`;

  it.each([
    ['logout begins', () => useAuthStore.setState({ isLoggingOut: true })],
    ['the session is replaced', () => useAuthStore.setState({ session: session() })],
  ])("submits nothing when %s during the retry's task lookup", async (_name, change) => {
    vi.spyOn(LocksService, 'generateBundleId').mockResolvedValue('B'.repeat(26));
    const submitProof = vi.spyOn(LocksService, 'submitProof').mockResolvedValue(asOpaque({ status: 'pending' }));
    vi.spyOn(LocksService, 'lookupVerificationTask').mockImplementation(async () => {
      change();
      return null;
    });
    homeserver.putBytes.mockRejectedValueOnce(sdkError(503));
    onBackoff = () => {
      homeserver.files.set(savedPurchase, JSON.stringify({ bundle_id: BUNDLE }));
    };

    await expect(
      LocksApplication.startPayment({ lockFile, lockUrl, readerPubky: USER, isRetry: false }),
    ).rejects.toMatchObject({ code: AuthErrorCode.SESSION_EXPIRED });
    expect(submitProof).not.toHaveBeenCalled();
  });

  it('still submits the reused bundle while the session is current', async () => {
    vi.spyOn(LocksService, 'generateBundleId').mockResolvedValue('B'.repeat(26));
    const submitProof = vi.spyOn(LocksService, 'submitProof').mockResolvedValue(asOpaque({ status: 'pending' }));
    vi.spyOn(LocksService, 'lookupVerificationTask').mockResolvedValue(null);
    homeserver.putBytes.mockRejectedValueOnce(sdkError(503));
    onBackoff = () => {
      homeserver.files.set(savedPurchase, JSON.stringify({ bundle_id: BUNDLE }));
    };

    await expect(
      LocksApplication.startPayment({ lockFile, lockUrl, readerPubky: USER, isRetry: false }),
    ).resolves.toEqual({ bundleId: BUNDLE, status: 'pending' });
    expect(submitProof).toHaveBeenCalledWith(expect.objectContaining({ bundle_id: BUNDLE }));
  });
});
