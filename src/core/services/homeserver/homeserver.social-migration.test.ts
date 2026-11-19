import type { Session } from '@synonymdev/pubky';
import type { ProgressEvent } from 'pubky-social-migrator';
import { buildFile, buildPost, decodeContent, decodeObject } from 'pubky-social-specs';
import { memoryHomeserver } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCIAL_MIGRATION_FLAG_PATH, SOCIAL_MIGRATION_TRANSFORM_REV } from '@/config/social-migration';
import { AuthErrorCode, NetworkErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory } from '@/libs/error/error.types';
import { resolveArticleCover } from '@/libs/post/articleCover';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import { withFrozenSpecClock } from '@/test-utils/spec-clock';
import { asOpaque } from '@/test-utils/type-assertions';
import { VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';
import { createTestWebLocks } from '@/test-utils/web-locks';

const LEGACY_PROFILE = '/pub/pubky.app/profile.json';
const V1_PROFILE = '/pub/social/v1/profile.json';

/**
 * The real migrator (wasm included) over the in-memory homeserver. The session is passed
 * explicitly and never read from the auth store: the gate runs before the session enters it.
 */
describe('HomeserverService.migrateToSocialV1', () => {
  let homeserver: ReturnType<typeof memoryHomeserver>;
  let session: Session;
  const readJson = async (path: string) =>
    JSON.parse(new TextDecoder().decode(await homeserver.session.storage.getBytes(path)));

  beforeEach(async () => {
    homeserver = memoryHomeserver();
    session = asOpaque<Session>(homeserver.session);
    await homeserver.session.storage.putJson(LEGACY_PROFILE, { name: 'Alice', bio: 'hi' });
    useAuthStore.getState().reset();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: createTestWebLocks() });
  });

  afterEach(() => {
    useAuthStore.getState().reset();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  });

  it('copies the 0.x tree of the given session to social v1 and writes the flag; a second run only reads it', async () => {
    const phases: ProgressEvent['phase'][] = [];
    const report = await HomeserverService.migrateToSocialV1({
      session,
      onProgress: (event) => {
        if (phases.at(-1) !== event.phase) phases.push(event.phase);
      },
    });

    expect(report.status).toBe('done');
    expect(report.counts.written).toBe(1);
    expect(phases).toEqual(['probe', 'listing', 'migrating', 'flag', 'done']);
    expect(await readJson(V1_PROFILE)).toMatchObject({ name: 'Alice', bio: 'hi' });
    expect(await readJson(LEGACY_PROFILE)).toEqual({ name: 'Alice', bio: 'hi' });
    expect(await readJson(SOCIAL_MIGRATION_FLAG_PATH)).toMatchObject({ transform_rev: SOCIAL_MIGRATION_TRANSFORM_REV });
    // The store never saw the session
    expect(useAuthStore.getState().session).toBeNull();

    expect((await HomeserverService.migrateToSocialV1({ session })).status).toBe('already_migrated');
  });

  it('waits for the lock another tab holds instead of refusing, and reports the wait once', async () => {
    // The engine's lock name; a renamed lock would make this tab run unlocked beside the other one.
    const name = `pubky-social-migrator:${homeserver.owner}`;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const otherTab = navigator.locks.request(name, () => held);
    await vi.waitFor(async () => expect((await navigator.locks.query()).held).toHaveLength(1));
    const onLockWait = vi.fn();
    let settled = false;
    const run = HomeserverService.migrateToSocialV1({ session, onLockWait }).finally(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(onLockWait).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    release();
    await otherTab;

    expect((await run).status).toBe('done');
  });

  it('does not report a lock wait when nobody holds the lock', async () => {
    const onLockWait = vi.fn();

    await HomeserverService.migrateToSocialV1({ session, onLockWait });

    expect(onLockWait).not.toHaveBeenCalled();
  });

  it('stops when the session does not hold the migration grant', async () => {
    const narrow = asOpaque<Session>({
      ...homeserver.session,
      info: { ...homeserver.session.info, capabilities: ['/pub/pubky.app/:rw'] },
    });

    const report = await HomeserverService.migrateToSocialV1({ session: narrow });

    expect(report.error?.code).toBe('CAPS_MISSING');
    expect(await homeserver.session.storage.exists(V1_PROFILE)).toBe(false);
  });

  it('reports an abort as a report, whether the signal fired before the lock or during the run', async () => {
    const before = new AbortController();
    before.abort();
    const early = await HomeserverService.migrateToSocialV1({ session, signal: before.signal });
    expect(early.status).toBe('aborted');
    expect(early.error?.code).toBe('ABORTED');
    expect(await homeserver.session.storage.exists(V1_PROFILE)).toBe(false);

    const during = new AbortController();
    const report = await HomeserverService.migrateToSocialV1({
      session,
      signal: during.signal,
      onProgress: (event) => {
        if (event.phase === 'listing') during.abort();
      },
    });
    expect(report.status).toBe('aborted');
    expect(report.error?.code).toBe('ABORTED');
  });

  it('runs unlocked without Web Locks', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });

    const report = await HomeserverService.migrateToSocialV1({ session });

    expect(report.status).toBe('done');
  });

  // The engine's chunk is fetched when a run starts: a load that fails is the network, so the gate retries it on
  // reconnect like an unreachable homeserver instead of blocking on "Something went wrong". Every Retry, focus and
  // reconnect throws it again, so the service must not capture it: the controller's once-per-(account, code)-per-page
  // guard does (`docs/error-handling.md`, "The migration gate"). This is the contract test for that exception.
  it('throws the load failure uncaptured so the controller can capture it once', async () => {
    vi.doMock('pubky-social-migrator', () => {
      throw new TypeError('Failed to fetch dynamically imported module');
    });
    try {
      vi.resetModules();
      // The spies go on the fresh module graph the fresh service will import, before it is imported
      const { Err: freshErr } = await import('@/libs/error/error.factories');
      const { Logger: freshLogger } = await import('@/libs/logger/logger');
      const network = vi.spyOn(freshErr, 'network');
      const captured = vi.spyOn(freshLogger, 'error');
      const { HomeserverService: fresh } = await import('@/services/homeserver/homeserver');
      const failure = await fresh.migrateToSocialV1({ session }).then(
        () => null,
        (error: unknown) => error,
      );
      // The reset module graph has its own `AppError` class, so the shape is asserted rather than the instance
      expect(failure).toMatchObject({
        name: 'AppError',
        category: ErrorCategory.Network,
        code: NetworkErrorCode.CONNECTION_FAILED,
        operation: 'migrateToSocialV1',
        cause: expect.any(Error),
      });
      expect(network).not.toHaveBeenCalled();
      expect(captured).not.toHaveBeenCalled();
      expect(await homeserver.session.storage.exists(V1_PROFILE)).toBe(false);
    } finally {
      vi.doUnmock('pubky-social-migrator');
      vi.resetModules();
    }
  });
});

/**
 * The real migrator over the in-memory homeserver on a 0.x article, then the app's reader on what it stored: the
 * transform's article rule (pubky-social-specs#210, transform revision 4) and `resolveArticleCover` must agree on
 * the cover and on the file each `attachment:{n}` of the body shows.
 */
describe('HomeserverService.migrateToSocialV1 on a 0.x article', () => {
  let homeserver: ReturnType<typeof memoryHomeserver>;
  let session: Session;
  // A fixed clock, so every run mints the same ids and migrates the same input
  withFrozenSpecClock();

  // A timestamp id, spelled the same in both layouts; a post that is never stored mints one
  const mintId = () => buildPost(homeserver.owner, { content: 'id' }).id;

  /** A 0.x upload as a 0.x client made it: the blob, then its file record. Yields its 0.x URL and its v1 copy's. */
  const seedLegacyFile = async (byte: number, type: string, name: string) => {
    const bytes = new Uint8Array([byte, byte, byte]);
    // A 0.x blob id is the hash a v1 media id is
    const media = buildFile(homeserver.owner, { bytes, type });
    await homeserver.session.storage.putBytes(`/pub/pubky.app/blobs/${media.id}`, bytes);
    const fileId = mintId();
    await homeserver.session.storage.putJson(`/pub/pubky.app/files/${fileId}`, {
      name,
      created_at: VRT_FROZEN_NOW_MS * 1000,
      src: `pubky://${homeserver.owner}/pub/pubky.app/blobs/${media.id}`,
      content_type: type,
      size: bytes.length,
    });
    return { legacy: `pubky://${homeserver.owner}/pub/pubky.app/files/${fileId}`, v1: media.url, name };
  };

  /** Seeds a 0.x `long` post with this body and these attachments, migrates, and reads back the v1 post it became. */
  const migrateArticle = async (body: string, attachments: string[]) => {
    const postId = mintId();
    await homeserver.session.storage.putJson(`/pub/pubky.app/posts/${postId}`, {
      content: JSON.stringify({ title: 'Before the migration', body }),
      kind: 'long',
      parent: null,
      embed: null,
      attachments,
    });

    const report = await HomeserverService.migrateToSocialV1({ session });
    expect(report.status).toBe('done');

    const versions = await homeserver.session.storage.list(`/pub/social/v1/posts/${postId}/`);
    expect(versions).toHaveLength(1);
    const post = decodeObject(versions[0], await homeserver.publicStorage.getBytes(versions[0]), 'post');
    const envelope = decodeContent(post);
    if (envelope?.kind !== 'article') return expect.unreachable(`the copy of ${postId} is no article`);
    return { post, article: envelope.content };
  };

  beforeEach(() => {
    homeserver = memoryHomeserver();
    session = asOpaque<Session>(homeserver.session);
    Object.defineProperty(navigator, 'locks', { configurable: true, value: createTestWebLocks() });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  });

  it('moves an unreferenced image at slot 0 into the cover and renumbers the inline references (rule A)', async () => {
    const cover = await seedLegacyFile(1, 'image/png', 'cover.png');
    const image = await seedLegacyFile(2, 'image/png', 'inline.png');
    const video = await seedLegacyFile(3, 'video/mp4', 'clip.mp4');

    // The 0.x composer numbered the inline media from 1, after the cover at slot 0
    const { post, article } = await migrateArticle(
      'Intro\n\n![inline](attachment:1)\n\nBetween\n\n![clip](attachment:2)\n\n![inline again](attachment:1)',
      [cover.legacy, image.legacy, video.legacy],
    );

    expect(article.cover_image).toBe(cover.v1);
    expect(post.attachments).toEqual([
      { uri: image.v1, name: image.name, alt: null },
      { uri: video.v1, name: video.name, alt: null },
    ]);
    // Each reference follows its file down one slot; everything else in the body keeps its bytes
    expect(article.body).toBe(
      'Intro\n\n![inline](attachment:0)\n\nBetween\n\n![clip](attachment:1)\n\n![inline again](attachment:0)',
    );

    // Shape A: the slots index the attachments as stored, so each renumbered reference finds its file
    expect(resolveArticleCover({ content: post.content, attachments: post.attachments.map(({ uri }) => uri) })).toEqual(
      { cover: cover.v1, slots: [image.v1, video.v1], legacyCoverSlot: false, coverCandidate: null },
    );
  });

  it('keeps a referenced slot 0 inline, with no cover and the body as written (rule B)', async () => {
    const hero = await seedLegacyFile(4, 'image/png', 'hero.png');
    const second = await seedLegacyFile(5, 'image/png', 'second.png');
    const body = '![hero](attachment:0)\n\nText\n\n![second](attachment:1)';

    const { post, article } = await migrateArticle(body, [hero.legacy, second.legacy]);

    expect(article.cover_image).toBeNull();
    expect(article.body).toBe(body);
    expect(post.attachments).toEqual([
      { uri: hero.v1, name: hero.name, alt: null },
      { uri: second.v1, name: second.name, alt: null },
    ]);

    // Slot 0 is an image, but the body references it: inline media, never the cover
    expect(
      resolveArticleCover({
        content: post.content,
        attachments: post.attachments.map(({ uri }) => uri),
        slotZeroContentType: 'image/png',
      }),
    ).toEqual({ cover: null, slots: [hero.v1, second.v1], legacyCoverSlot: false, coverCandidate: null });
  });

  it('keeps a PDF at slot 0 an attachment, with no cover and the body as written (rule B, image-only)', async () => {
    const pdf = await seedLegacyFile(6, 'application/pdf', 'report.pdf');
    const image = await seedLegacyFile(7, 'image/png', 'figure.png');
    const body = 'Intro\n\n![figure](attachment:1)';

    const { post, article } = await migrateArticle(body, [pdf.legacy, image.legacy]);

    // Only an image can be a cover, so nothing moves and the references stay as the 0.x article numbered them
    expect(article.cover_image).toBeNull();
    expect(article.body).toBe(body);
    expect(post.attachments).toEqual([
      { uri: pdf.v1, name: pdf.name, alt: null },
      { uri: image.v1, name: image.name, alt: null },
    ]);

    // Slot 0 is unreferenced but its row says PDF: no cover, and the slots index the attachments directly
    expect(
      resolveArticleCover({
        content: post.content,
        attachments: post.attachments.map(({ uri }) => uri),
        slotZeroContentType: 'application/pdf',
      }),
    ).toEqual({ cover: null, slots: [pdf.v1, image.v1], legacyCoverSlot: false, coverCandidate: null });
  });
});

describe('HomeserverService.getBytesIfExists with an explicit session', () => {
  const owner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
  const sessionFor = (get: (path: string) => Promise<Response>): Session =>
    asOpaque<Session>({ info: { publicKey: { z32: () => owner }, capabilities: ['/:rw'] }, storage: { get } });

  afterEach(() => useAuthStore.getState().reset());

  it('reads through the given session while the store holds none', async () => {
    const get = vi.fn(async () => new Response('{"transform_rev":3}', { status: 200 }));
    useAuthStore.getState().reset();

    const result = await HomeserverService.getBytesIfExists(
      `pubky://${owner}/priv/social/v1/_migrated.json`,
      sessionFor(get),
    );

    expect(get).toHaveBeenCalledWith('/priv/social/v1/_migrated.json');
    expect(new TextDecoder().decode(result?.bytes)).toBe('{"transform_rev":3}');
  });

  it('is null on a 404 and throws on a refused read', async () => {
    const missing = sessionFor(async () => new Response(null, { status: 404 }));
    expect(
      await HomeserverService.getBytesIfExists(`pubky://${owner}/priv/social/v1/_migrated.json`, missing),
    ).toBeNull();

    const refused = sessionFor(async () => new Response('Forbidden', { status: 403 }));
    await expect(
      HomeserverService.getBytesIfExists(`pubky://${owner}/priv/social/v1/_migrated.json`, refused),
    ).rejects.toMatchObject({ context: expect.objectContaining({ statusCode: 403 }) });
  });

  it('throws on a 401 instead of reading the flag as absent (ADR-0026)', async () => {
    const expired = sessionFor(async () => new Response('Unauthorized', { status: 401 }));
    await expect(
      HomeserverService.getBytesIfExists(`pubky://${owner}/priv/social/v1/_migrated.json`, expired),
    ).rejects.toMatchObject({
      code: AuthErrorCode.SESSION_EXPIRED,
      context: expect.objectContaining({ statusCode: 401 }),
    });
  });

  it("refuses another owner's URL for the given session", async () => {
    const other = sessionFor(async () => new Response('{}', { status: 200 }));
    await expect(
      HomeserverService.getBytesIfExists('pubky://8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo/priv/x', other),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
