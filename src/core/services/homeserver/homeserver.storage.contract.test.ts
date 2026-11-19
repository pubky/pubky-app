import { webcrypto } from 'node:crypto';
import { Pubky, type Session } from '@synonymdev/pubky';
import { MigrationPortError } from 'pubky-social-migrator';
import { sdkPort } from 'pubky-social-migrator/pubky-sdk';
import {
  buildBookmark,
  buildFeed,
  buildFile,
  buildFollow,
  buildMute,
  buildPost,
  buildTag,
  buildUri,
  buildUser,
} from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_LAST_READ_FILE,
  APP_PRIVATE_PATH,
  APP_SETTINGS_FILE,
  LEGACY_LAST_READ_PATH,
  LEGACY_SETTINGS_PATH,
} from '@/config/app-files';
import { getAuthClientId } from '@/config/auth';
import { LOCKS_GUARDED_CONTENT_PATH } from '@/config/locks';
import { SOCIAL_MIGRATION_FLAG_PATH } from '@/config/social-migration';
import type { SessionReference } from '@/libs/auth/session.types';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { GuardedContentParser } from '@/pipes/locks/locks.parser';
import { useAuthStore } from '@/stores/auth/auth.store';
import { freezeSpecClock, restoreSpecClock } from '@/test-utils/spec-clock';
import { createTestWebLocks } from '@/test-utils/web-locks';
import grantAuth015 from './grant-auth-0.15.fixture.json';
import { HomeserverService } from './homeserver';
import {
  HOMESERVER_WRITE_MAX_ATTEMPTS,
  installHomeserverWriteRetryDependenciesForTests,
  retryHomeserverWriteAfterReread,
} from './write-retry';

// The synthetic identities of session-store.contract.test.ts: zero-seed user -> one-seed homeserver ->
// legacy-cookie.test. The packets are signed and public; they are not live accounts.
const USER = '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo';
const HOMESERVER_ORIGIN = 'https://legacy-cookie.test';
const routingPackets: Record<string, string> = {
  [USER]:
    'XTDocF4Xf6HpVOBIowal9ggCGKv383XHTY9OHqmQRvRPd+0uJDBTxrKwIUzoaERgl/4+DWme0M3YTe3XfM1wBAAGZRcomIAAAACAAAAAAAEAAAAABl9wdWJreTQ4cGlueHhncXM0MW40YWlkaWRlbnc1YXBxcDF1cmZtemR6dHI4anQ0YWJya2RuNDM1ZXdvAABBAAEAAA4QADgAADR0a3JxOHptd2I4YTNtOWsxNWNzdTNxMTdxbWZncW5wOWRza2JyZzl1cTFyeWRweXhwN3F5AA==',
  tkrq8zmwb8a3m9k15csu3q17qmfgqnp9dskbrg9uq1rydpyxp7qy:
    'FSgcCvQf4IDHyAtpTkQvSSCN3RsLYv7QC1vNT3qOf9nhNFbL89xLKYGT7LAfAeBLX723CTWU1v5jzB2PCWZnDwAGZRcomIAAAACAAAAAAAEAAAAANHRrcnE4em13YjhhM205azE1Y3N1M3ExN3FtZmdxbnA5ZHNrYnJnOXVxMXJ5ZHB5eHA3cXkAAEEAAQAADhAAFgABDWxlZ2FjeS1jb29raWUEdGVzdAA=',
};

// A session the SDK's browser store saved (the app only ever sends storage requests with one), restored
// while its bearer is still valid, so the only refresh in a test is the one a 401 causes.
const record = grantAuth015.local.storedSession;
const savedBearer = record.sharedSession.response.token;
const NOW_MS = (record.sharedSession.response.session.token_expires_at - 3_600) * 1_000;
const reference: SessionReference = {
  kind: 'grant',
  sessionStoreId: record.id,
  grantId: record.grantId,
  clientId: getAuthClientId(),
  grantExpiresAt: record.grantExpiresAt,
  tokenExpiresAt: record.sharedSession.response.session.token_expires_at,
};

/** One request to the user's storage as the homeserver received it. */
type StorageRequest = { method: string; path: string; search: string; bearer: string | null };
type Answer = (request: StorageRequest, raw: Request) => Response | Promise<Response>;

const STORAGE_ROOT = `/storage/${USER}`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const refused = (status: number, body = 'refused') => new Response(body, { status });

let storage: StorageRequest[];
let refreshes: number;
/** The session the homeserver holds for the bearer: what revalidation reads and a refresh re-issues. */
let held: typeof record.sharedSession.response;
let answer: Answer;
/** What the homeserver answers a bearer refresh; a status refuses it. */
let refresh: 'issue' | number;

const openSessionDatabase = async () => {
  // The SDK creates its own database and stores.
  expect(await new Pubky().browserSessionStore.isAvailable()).toBe(true);
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pubky-auth', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const putRecord = async () => {
  const db = await openSessionDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('storedSessions', 'readwrite');
      tx.objectStore('storedSessions').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};

/**
 * Only HTTP is replaced. The homeserver advertises path-addressed storage as staging and production do, answers
 * session revalidation and bearer refresh, and hands every storage request to `answer`. The SDK's session store,
 * Web Locks coordination, PKARR verification, request building and error mapping stay real.
 */
const stubHomeserver = () =>
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = input instanceof Request ? input : new Request(input, init);
    const url = new URL(raw.url);
    const respond = (response: Response) => Object.defineProperty(response, 'url', { value: raw.url });
    const packet = routingPackets[url.pathname.slice(1)];
    if (packet) return respond(new Response(Buffer.from(packet, 'base64')));
    expect(url.origin).toBe(HOMESERVER_ORIGIN);
    if (url.pathname === '/info') {
      return respond(json({ features: ['path-addressed-storage', 'grant-proof-logout', 'webdav-locks'] }));
    }
    if (url.pathname === '/auth/grant/session') {
      if (raw.method === 'GET') return respond(json(held.session));
      expect(raw.method).toBe('POST');
      refreshes += 1;
      if (refresh !== 'issue') return respond(refused(refresh));
      return respond(json({ ...held, token: `refreshed-bearer-${refreshes}` }));
    }
    expect(url.pathname.startsWith(`${STORAGE_ROOT}/`)).toBe(true);
    const request: StorageRequest = {
      method: raw.method,
      // The request line as sent: `pathname` keeps the SDK's percent-encoding.
      path: url.pathname.slice(STORAGE_ROOT.length),
      search: url.search,
      bearer: raw.headers.get('authorization'),
    };
    storage.push(request);
    return respond(await answer(request, raw));
  });

let session: Session;
const sessionFailures = vi.fn();
let unsubscribe = () => {};

beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { locks: createTestWebLocks() });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW_MS);
  // The policy's backoff is not under test; its attempts are.
  installHomeserverWriteRetryDependenciesForTests({ sleep: async () => {} });
  storage = [];
  refreshes = 0;
  held = record.sharedSession.response;
  refresh = 'issue';
  answer = () => json({});
  stubHomeserver();
  await putRecord();
  session = await HomeserverService.restoreReference(reference);
  useAuthStore.setState({ session, currentUserPubky: USER, sessionReference: reference, restoreStatus: 'ready' });
  sessionFailures.mockReset();
  unsubscribe = HomeserverService.subscribeSessionFailures(sessionFailures);
});

afterEach(() => {
  unsubscribe();
  useAuthStore.setState({ session: null, currentUserPubky: null, sessionReference: null, restoreStatus: 'idle' });
  installHomeserverWriteRetryDependenciesForTests(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const url = (path: string) => `pubky://${USER}${path}`;
const sent = (method: string) => storage.filter((request) => request.method === method);

describe('pinned SDK 0.18.0 storage path contract', () => {
  // One path of every tree the app reads and writes: the v1 objects as `pubky-social-specs` builds them, the
  // app's own files, the reader's Locks files, the creator's guarded content and the 0.x files still read or
  // deleted. Every character is unreserved (`A-Za-z0-9-_.~`), so SDK 0.18.0 sends each as written, as 0.17.1
  // did, and a file written before the bump is found at the same name after it.
  const other = fakeOwner(1);
  // Known ids, so the test names are the same on every run.
  freezeSpecClock(NOW_MS);
  const post = buildPost(USER, { kind: 'note', content: 'A note' });
  const target = buildUri(other, 'post', post.id);
  // The Lock Server's lock id and the SDK's bundle id are Crockford base32; a guarded file is a UUID.
  const lockId = '0034A0X7NJ52G';
  const bundleId = '0123456789ABCDEFGHJKMNPQRS';
  const appPaths = [
    buildUser(USER, { name: 'Ada', bio: null }).path,
    post.path,
    buildFile(USER, { bytes: new Uint8Array([1]), type: 'image/png' }).path,
    buildTag(USER, target, 'tag').path,
    buildFollow(USER, other).path,
    buildMute(USER, other).path,
    // Both bookmark ids: the target in base64url, and `~` with the hash of a target too long for a name.
    buildBookmark(USER, target).path,
    buildBookmark(USER, `https://example.com/${'a'.repeat(200)}`).path,
    buildFeed(USER, { name: 'Feed', icon: 'star', reach: 'all', layout: 'columns', sort: 'recent' }).path,
    SOCIAL_MIGRATION_FLAG_PATH,
    `${APP_PRIVATE_PATH}${APP_SETTINGS_FILE}`,
    `${APP_PRIVATE_PATH}${APP_LAST_READ_FILE}`,
    ...[
      GuardedContentParser.purchaseUrl(USER, lockId, bundleId),
      GuardedContentParser.legacyPurchaseUrl(USER, lockId),
      GuardedContentParser.unlockedPostUrl(USER, lockId),
    ].map((owned) => owned.slice(`pubky://${USER}`.length)),
    `${LOCKS_GUARDED_CONTENT_PATH}6f1c6f0e-7d0c-4a5e-9d0b-3a2f8a8d5c11`,
    `/pub/app.locks/${lockId}.json`,
    LEGACY_SETTINGS_PATH,
    LEGACY_LAST_READ_PATH,
    `/pub/pubky.app/posts/${post.id}`,
  ];
  restoreSpecClock();

  it.each(appPaths)('sends %s as written on every verb', async (path) => {
    await HomeserverService.request({ method: HttpMethod.PUT, url: url(path), bodyJson: { a: 1 } });
    await HomeserverService.putBlob({ url: url(path), blob: new Uint8Array([1]) });
    await HomeserverService.get(url(path));
    await HomeserverService.exists(url(path));
    await HomeserverService.delete(url(path));

    expect(storage.map(({ method, path: wire }) => `${method} ${wire}`)).toEqual([
      `PUT ${path}`,
      `PUT ${path}`,
      `GET ${path}`,
      `HEAD ${path}`,
      `DELETE ${path}`,
    ]);
  });

  // Upstream #797: a path is a plain name, escaped exactly once for the URL. SDK 0.17.1 escaped twice (a space
  // went out as `%2520`), so a file it wrote under such a name is stored under the escaped name and is read
  // through 0.18.0 at that stored name. The app builds no such name; this pins what happens if one appears.
  it.each([
    ['/pub/t/my file.txt', '/pub/t/my%20file.txt'],
    ['/pub/t/my%20file.txt', '/pub/t/my%2520file.txt'],
    ['/pub/t/100%', '/pub/t/100%25'],
    ['/pub/t/a:b,c@d+e', '/pub/t/a%3Ab%2Cc%40d%2Be'],
    ['/pub/t/über', '/pub/t/%C3%BCber'],
  ])('escapes every other byte of %s exactly once', async (path, wire) => {
    await HomeserverService.request({ method: HttpMethod.PUT, url: url(path), bodyJson: { a: 1 } });
    await HomeserverService.get(url(path));

    expect(storage.map((request) => request.path)).toEqual([wire, wire]);
  });

  it('lists plain names and pages with the entry it was given', async () => {
    const directory = '/pub/social/v1/tags/';
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) => url(`${directory}${String(from + index).padStart(4, '0')}.json`));
    // The homeserver sends one `pubky://<owner><path>` line per entry, names unescaped.
    const first = [...page(0, 498), url(`${directory}my file.json`), url(`${directory}my%20file.json`)];
    const second = page(600, 3);
    answer = ({ search }) => new Response(`${(search.includes('cursor=') ? second : first).join('\n')}\n`);

    const listed = await HomeserverService.listAll({ baseDirectory: url(directory) });

    // Entries come back exactly as the homeserver named them: nothing to decode, and an escaped stored name
    // stays distinct from the plain one.
    expect(listed).toEqual([...first, ...second]);
    expect(storage.map((request) => request.path)).toEqual([directory, directory]);
    expect(new URLSearchParams(storage[0].search).get('cursor')).toBeNull();
    // The cursor is the last entry of the page as listed; the SDK form-encodes it once.
    expect(new URLSearchParams(storage[1].search).get('cursor')).toBe(first.at(-1));
  });
});

describe('pinned SDK 0.18.0 stored session contract', () => {
  // The SDK's browser store (`pubky-sdk/bindings/js/src/actors/session_store.rs` upstream) is the same code from
  // 0.16.2 through 0.18.0 and writes the fields of this fixture's records, which 0.15 saved, so a session saved
  // before an SDK bump restores after it. Every other test in this file starts from the `local` record; this is
  // the `delegated` one, whose proof key is a non-extractable WebCrypto key.
  it('restores a delegated session saved by an older SDK to a working session', async () => {
    const delegated = grantAuth015.delegated;
    const key = delegated.key;
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      Buffer.from(key.privateKeyPkcs8, 'base64'),
      'Ed25519',
      false,
      ['sign'],
    );
    const db = await openSessionDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['storedSessions', 'delegatedGrantKeys'], 'readwrite');
        tx.objectStore('storedSessions').put(delegated.storedSession);
        tx.objectStore('delegatedGrantKeys').put({
          keyId: key.keyId,
          privateKey,
          publicKeyRaw: new Uint8Array(Buffer.from(key.publicKeyRaw, 'base64')),
          createdAt: key.createdAt,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
    held = delegated.storedSession.sharedSession.response;
    const restored = await HomeserverService.restoreReference({
      ...reference,
      sessionStoreId: delegated.storedSession.id,
      grantId: delegated.storedSession.grantId,
    });
    useAuthStore.setState({ session: restored });
    // The refresh after a 401 signs its proof with the stored, non-extractable key.
    answer = ({ bearer }) => (bearer === `Bearer ${savedBearer}` ? refused(401) : json({}));

    await HomeserverService.request({ method: HttpMethod.PUT, url: url('/pub/social/v1/profile.json'), bodyJson: {} });

    expect(sent('PUT').map((request) => request.bearer)).toEqual([
      `Bearer ${savedBearer}`,
      'Bearer refreshed-bearer-1',
    ]);
  });
});

describe('pinned SDK 0.18.0 rejected bearer contract', () => {
  const profile = url('/pub/social/v1/profile.json');
  const put = (options: { fence?: ReturnType<typeof HomeserverService.createWriteFence> } = {}) =>
    HomeserverService.request({ method: HttpMethod.PUT, url: profile, bodyJson: { name: 'Ada' }, ...options });

  it('refreshes once and replays a rejected write once, and the write lands', async () => {
    answer = ({ bearer }) => (bearer === `Bearer ${savedBearer}` ? refused(401) : json({}));

    await expect(put()).resolves.toBeUndefined();

    expect(sent('PUT').map((request) => request.bearer)).toEqual([
      `Bearer ${savedBearer}`,
      'Bearer refreshed-bearer-1',
    ]);
    expect(refreshes).toBe(1);
    expect(sessionFailures).not.toHaveBeenCalled();
  });

  it('ends the session when the replay is rejected too, without a policy retry', async () => {
    answer = () => refused(401);

    await expect(put()).rejects.toMatchObject({
      category: ErrorCategory.Auth,
      code: AuthErrorCode.SESSION_EXPIRED,
    });

    // One SDK call: the request, one refresh, one replay. A 401 is not a status the write policy retries.
    expect(sent('PUT')).toHaveLength(2);
    expect(refreshes).toBe(1);
    expect(sessionFailures).toHaveBeenCalledTimes(1);
    expect(sessionFailures).toHaveBeenCalledWith(expect.objectContaining({ session }));
  });

  it('ends the session without a replay when the homeserver refuses the refresh', async () => {
    answer = () => refused(401);
    refresh = 401;

    await expect(put()).rejects.toMatchObject({
      category: ErrorCategory.Auth,
      code: AuthErrorCode.SESSION_EXPIRED,
    });

    expect(sent('PUT')).toHaveLength(1);
    expect(refreshes).toBe(1);
    expect(sessionFailures).toHaveBeenCalledTimes(1);
  });

  it('replays a fenced write only after a 401, inside its one attempt per pass', async () => {
    // A pass of a read-check-write makes one SDK call. The SDK repeats the request inside that call only after
    // the homeserver refused the bearer, which is before the write was applied, so no stale body lands twice.
    answer = ({ bearer }) => (bearer === `Bearer ${savedBearer}` ? refused(401) : refused(503));
    const fence = HomeserverService.createWriteFence();
    const passes: number[] = [];

    await expect(
      retryHomeserverWriteAfterReread(fence, async (pass) => {
        passes.push(pass);
        await put({ fence });
      }),
    ).rejects.toMatchObject({ category: ErrorCategory.Server });

    // Pass 0: the rejected request and its replay. Passes 1 and 2: one request each, with the refreshed bearer.
    expect(passes).toEqual([0, 1, 2]);
    expect(sent('PUT')).toHaveLength(HOMESERVER_WRITE_MAX_ATTEMPTS + 1);
    expect(refreshes).toBe(1);
    expect(sessionFailures).not.toHaveBeenCalled();
  });

  it.each([403, 423, 429, 500, 507])('does not refresh or replay inside the SDK on %i', async (status) => {
    answer = () => refused(status);

    await expect(
      HomeserverService.request({ method: HttpMethod.PUT, url: profile, bodyJson: {}, singleAttempt: true }),
    ).rejects.toBeDefined();

    expect(sent('PUT')).toHaveLength(1);
    expect(refreshes).toBe(0);
  });
});

describe('pinned SDK 0.18.0 publish conflict contract', () => {
  const tag = url('/pub/social/v1/tags/0034A0X7NJ52G.json');
  // The body of the homeserver's publish conflict, as `pubky-homeserver/src/shared/http_error.rs` (v0.18.0)
  // spells it. Written out here, not imported, so a drift in the app's copy fails this test.
  const PUBLISH_CONFLICT_BODY = 'The file changed before the change was published; read it again and retry';

  it('retries the 409 whose body the SDK carries in its error message', async () => {
    answer = () => refused(409, PUBLISH_CONFLICT_BODY);

    await expect(HomeserverService.request({ method: HttpMethod.PUT, url: tag, bodyJson: {} })).rejects.toBeDefined();

    expect(sent('PUT')).toHaveLength(HOMESERVER_WRITE_MAX_ATTEMPTS);
  });

  it('does not retry a 409 with any other body', async () => {
    answer = () => refused(409, 'A file exists where a directory is needed');

    await expect(HomeserverService.request({ method: HttpMethod.PUT, url: tag, bodyJson: {} })).rejects.toBeDefined();

    expect(sent('PUT')).toHaveLength(1);
  });
});

describe('pubky-social-migrator port on the pinned SDK 0.18.0', () => {
  const legacyPosts = `pubky://${USER}/pub/pubky.app/posts/`;

  it('lists entries in the spelling of the prefix it was given', async () => {
    const entries = ['0034A0X7NJ52G', '0034A0X7NJ52H'].map((id) => `${legacyPosts}${id}`);
    answer = () => new Response(`${entries.join('\n')}\n`);

    const page = await sdkPort(session).list(legacyPosts);

    // The engine stops a run on an entry outside the prefix it listed, and resumes from the last entry.
    expect(page).toEqual({ urls: entries, next: entries.at(-1) });
    expect(storage.map((request) => `${request.method} ${request.path}`)).toEqual(['GET /pub/pubky.app/posts/']);
  });

  // The port reads the status from the SDK error's `data.statusCode` and the engine branches on the kind.
  it.each([
    [429, 'rate_limited'],
    [507, 'quota'],
    [403, 'unauthorized'],
    [500, 'network'],
    [413, 'rejected'],
  ] as const)('classifies a %i write as %s after one request', async (status, kind) => {
    answer = () => refused(status);

    const failure = await sdkPort(session)
      .putJson(`${legacyPosts}0034A0X7NJ52G`, {})
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MigrationPortError);
    expect(failure).toMatchObject({ kind, status });
    expect(sent('PUT')).toHaveLength(1);
  });

  it('classifies a write the homeserver keeps rejecting with 401 as unauthorized after the SDK replay', async () => {
    answer = () => refused(401);

    const failure = await sdkPort(session)
      .putJson(`${legacyPosts}0034A0X7NJ52G`, {})
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ kind: 'unauthorized', status: 401 });
    expect(sent('PUT')).toHaveLength(2);
    expect(refreshes).toBe(1);
  });

  it('reads a missing object as absent and an unanswered request as a network failure', async () => {
    answer = () => refused(404);
    await expect(sdkPort(session).get(`${legacyPosts}0034A0X7NJ52G`)).resolves.toBeNull();

    answer = () => {
      throw new DOMException('Synthetic transport failure', 'NetworkError');
    };
    await expect(sdkPort(session).get(`${legacyPosts}0034A0X7NJ52G`)).rejects.toMatchObject({ kind: 'network' });
  });
});
