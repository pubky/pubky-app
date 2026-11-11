import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { Keypair, Pubky, PublicKey, type Session } from '@synonymdev/pubky';
import { decodeObject, encodeObject } from 'pubky-social-specs';
import { LOCKS_GUARDED_CONTENT_PATH } from '../../src/config/locks';
import type {
  SeedBookmarkArgs,
  SeedCreateCollectionArgs,
  SeedCreateLockPostArgs,
  SeedCreatePostArgs,
  SeedCreateUserArgs,
  SeedDeletePostArgs,
  SeededLegacyLock,
  SeedEditPostArgs,
  SeededLockPost,
  SeededPost,
  SeededUser,
  SeedFollowArgs,
  SeedLegacyLockArgs,
  SeedListPathsArgs,
  SeedMarkNotificationsReadArgs,
  SeedMuteArgs,
  SeedSettingsArgs,
  SeedTagArgs,
} from '../support/types/seed';
import { legacyWriter, v1Writer, type SeedWriter } from './seed.writers';

/**
 * Node side of the spec seeding helpers in `cypress/support/seed.ts`.
 *
 * Specs set up the users and activity a test only observes through the same Pubky libraries the
 * app writes with (`@synonymdev/pubky` + `pubky-social-specs`), straight against the test stack's
 * homeserver. Nexus indexes those writes exactly as it indexes the app's, so feeds, notifications
 * and pagination are still exercised end to end; only the setup clicks are skipped.
 *
 * A user is on one data epoch for the whole run, picked when they are created: v1, or `legacy` for
 * an un-migrated 0.x account (see `seed.writers.ts`).
 */

export type SeedConfig = {
  homeserverAdminUrl: string;
  homeserverAdminPassword: string;
  homeserverPublicKey: string;
  nexusUrl: string;
};

// The passcode `cy.signInWithEncryptedFile` types by default
const RECOVERY_FILE_PASSCODE = '123456';
const SEED_CLIENT_ID = 'e2e-seed.pubky.app';
// Consecutive seed writes start at least this far apart, so records a test orders by time
// (timelines, threads, notifications) never share a timestamp
const SEED_WRITE_SPACING_MS = 5;
// More than any spec seeds under one prefix, so one page lists it all
const LIST_PAGE_SIZE = 1000;

type SeededSession = { name: string; session: Session; writer: SeedWriter; legacy: boolean };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const preview = (text: string) => (text.length > 48 ? `${text.slice(0, 45)}...` : text);

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
};

export const createSeedTasks = (config: SeedConfig) => {
  // Sessions live in this Node process for the Cypress run, so a spec can act as any user it seeded
  // earlier. They are not persisted: re-running one test in `cypress open` without the hook that
  // seeded its users fails with "was not seeded in this Cypress run", so re-run the whole spec.
  const sessions = new Map<string, SeededSession>();
  let sdk: Pubky | undefined;
  const pubky = () => (sdk ??= Pubky.testnet('localhost'));

  const sessionFor = (userId: string): SeededSession => {
    const seeded = sessions.get(userId);
    if (!seeded) {
      throw new Error(`user ${userId} was not seeded in this Cypress run`);
    }
    return seeded;
  };
  const nameOf = (userId: string) => sessions.get(userId)?.name ?? userId;
  let lastStepAt = 0;

  // Runs one seed step, timing it and naming it in any failure so a broken seed points at its step
  const step = async <T>(label: string, run: () => Promise<T>): Promise<T> => {
    const spacing = lastStepAt + SEED_WRITE_SPACING_MS - Date.now();
    if (spacing > 0) await sleep(spacing);
    const startedAt = Date.now();
    lastStepAt = startedAt;
    try {
      const result = await run();
      console.log(`[seed] ${label} (${Date.now() - startedAt}ms)`);
      return result;
    } catch (error) {
      throw new Error(`Seed step "${label}" failed: ${errorMessage(error)}`);
    }
  };

  const fetchSignupToken = async () => {
    const response = await fetch(config.homeserverAdminUrl, {
      headers: { 'X-Admin-Password': config.homeserverAdminPassword },
    });
    if (!response.ok) {
      throw new Error(`signup token request to ${config.homeserverAdminUrl} answered ${response.status}`);
    }
    return (await response.text()).trim();
  };

  return {
    seedCreateUser: ({ name, bio, recoveryFilePath, legacy = false }: SeedCreateUserArgs): Promise<SeededUser> =>
      step(`create ${legacy ? 'un-migrated ' : ''}user '${name}'`, async () => {
        const keypair = Keypair.random();
        const signer = pubky().signer(keypair);
        await signer.signup(PublicKey.from(config.homeserverPublicKey), await fetchSignupToken());
        const session = await signer.signin(SEED_CLIENT_ID);
        const id = keypair.publicKey.z32();
        const writer = legacy ? legacyWriter(id, session) : v1Writer(id, session);
        const uri = await writer.writeProfile(name, bio);
        if (recoveryFilePath) {
          mkdirSync(dirname(recoveryFilePath), { recursive: true });
          writeFileSync(recoveryFilePath, keypair.createRecoveryFile(RECOVERY_FILE_PASSCODE));
        }
        // Like the app after onboarding, tell Nexus about the new user; best effort, as in the app
        await fetch(`${config.nexusUrl.replace(/\/$/, '')}/v1/ingest/${id}`, { method: 'PUT' }).catch(() => null);
        sessions.set(id, { name, session, writer, legacy });
        return { id, pubky: `pubky${id}`, uri, name };
      }),

    seedCreatePost: (args: SeedCreatePostArgs): Promise<SeededPost> =>
      step(`create ${args.kind} post by '${nameOf(args.authorId)}': "${preview(args.content)}"`, async () => {
        const { writer } = sessionFor(args.authorId);
        const post = await writer.writePost(args);
        // The app tags a post created with tags as its author, after the post itself
        for (const label of args.tags ?? []) {
          await writer.writeTag(post.uri, label);
        }
        return { ...post, authorId: args.authorId, kind: args.kind };
      }),

    seedEditPost: ({ authorId, postId, content }: SeedEditPostArgs) =>
      step(`edit post ${postId} by '${nameOf(authorId)}'`, async () => {
        await sessionFor(authorId).writer.editPost(postId, content);
        return { id: postId };
      }),

    seedDeletePost: ({ authorId, postId }: SeedDeletePostArgs) =>
      step(`delete post ${postId} by '${nameOf(authorId)}'`, async () => {
        await sessionFor(authorId).writer.deletePost(postId);
        return { id: postId };
      }),

    seedTag: ({ taggerId, uri, label }: SeedTagArgs) =>
      step(`tag ${uri} as '${label}' by '${nameOf(taggerId)}'`, async () => ({
        id: await sessionFor(taggerId).writer.writeTag(uri, label),
      })),

    seedFollow: ({ followerId, followeeId }: SeedFollowArgs) =>
      step(`'${nameOf(followerId)}' follows '${nameOf(followeeId)}'`, async () => {
        await sessionFor(followerId).writer.writeFollow(followeeId);
        return { id: followeeId };
      }),

    seedBookmark: ({ userId, uri }: SeedBookmarkArgs) =>
      step(`bookmark ${uri} by '${nameOf(userId)}'`, async () => {
        await sessionFor(userId).writer.writeBookmark(uri);
        return { uri };
      }),

    seedMute: ({ userId, muteeId }: SeedMuteArgs) =>
      step(`'${nameOf(userId)}' mutes '${nameOf(muteeId)}'`, async () => {
        await sessionFor(userId).writer.writeMute(muteeId);
        return { id: muteeId };
      }),

    seedMarkNotificationsRead: ({ userId }: SeedMarkNotificationsReadArgs) =>
      step(`mark notifications read for '${nameOf(userId)}'`, async () => {
        const timestamp = Date.now();
        await sessionFor(userId).writer.writeLastRead(timestamp);
        return { timestamp };
      }),

    seedSettings: ({ userId, settings }: SeedSettingsArgs) =>
      step(`write settings of '${nameOf(userId)}'`, async () => {
        await sessionFor(userId).writer.writeSettings(settings);
        return settings;
      }),

    seedLegacyLock: ({ authorId, ...lock }: SeedLegacyLockArgs): Promise<SeededLegacyLock> =>
      step(`publish a lock by '${nameOf(authorId)}': "${preview(lock.teaser.teaser_description)}"`, () =>
        sessionFor(authorId).writer.writeLock(lock),
      ),

    // Not a seed: reads a post an intercepted write carried with the library the seeds build posts with, which
    // stays on this side so the specs do not bundle it. Rejects a body that is not a stored v1 post.
    decodeStoredPost: ({ body }: { body: string }) => decodeObject({ kind: 'post' }, new TextEncoder().encode(body)),

    // Not a seed: every URL under `prefix` in a seeded user's tree, read back with their session, so a spec can
    // count what a run left on the homeserver. Deep and ascending, like the migrator's own LIST.
    listHomeserverPaths: ({ userId, prefix }: SeedListPathsArgs): Promise<string[]> =>
      sessionFor(userId).session.storage.list(prefix, null, false, LIST_PAGE_SIZE, false),

    seedCreateCollection: ({ authorId, ...collection }: SeedCreateCollectionArgs): Promise<SeededPost> =>
      step(`create collection '${collection.name}' by '${nameOf(authorId)}'`, async () => ({
        ...(await sessionFor(authorId).writer.writeCollection(collection)),
        authorId,
        kind: 'collection',
      })),

    // A paid lock as the Lock Server leaves it (the public lock.json), then its announcement as the
    // composer posts it: a note whose `content` is the teaser envelope and whose `lock` names the lock
    // file. The locked post itself is only ever read through the Lock Server, so it is returned, encoded
    // as the app encodes a guarded primary (`GuardedPostBuilder.toPrimary`), for the spec's stub to
    // serve rather than written under /priv.
    seedCreateLockPost: ({
      authorId,
      title,
      teaser,
      lockedContent,
      amount,
    }: SeedCreateLockPostArgs): Promise<SeededLockPost> =>
      step(`create lock post by '${nameOf(authorId)}': "${preview(teaser)}"`, async () => {
        const author = sessionFor(authorId);
        // The guarded post below is the v1 encoding, which a 0.x client never wrote
        if (author.legacy) {
          throw new Error('a lock post is seeded for a v1 account only');
        }
        const lockId = `e2eseed${Date.now()}`;
        const guardedPath = `post-${lockId}`;
        const guardedPost = encodeObject(
          { kind: 'post', root: 'private' },
          { content: lockedContent, kind: 'note', parent: null, embed: null, attachments: [], lock: null },
        );
        const lockPath = `/pub/app.locks/${lockId}.json` as const;
        await author.session.storage.putJson(lockPath, {
          version: 1,
          creator: `pubky${authorId}`,
          primary_resource: {
            path: `${LOCKS_GUARDED_CONTENT_PATH}${guardedPath}`,
            hash: `e2e-${guardedPath}`,
            content_type: 'application/octet-stream',
            size: guardedPost.length,
          },
          secondary_resources: {},
          criteria: [
            {
              criterion_id: 'criterion-1',
              verifier_type: 'paykit-payment',
              params: { recipient_pubky: `pubky${authorId}`, amount, asset: 'BTC' },
            },
          ],
          lock_logic: { type: 'all', criteria: ['criterion-1'] },
          access_policy: { requested_credential_ttl_seconds: 900 },
          lock_server: { override: null },
        });
        const post = await author.writer.writePost({
          content: JSON.stringify({ lock_title: title, teaser_description: teaser, content_kind: 'note' }),
          kind: 'note',
          lock: `pubky://${authorId}${lockPath}`,
        });
        return {
          ...post,
          authorId,
          kind: 'note',
          lockId,
          guardedPath,
          guardedBytes: Buffer.from(guardedPost).toString('base64'),
        };
      }),
  };
};
