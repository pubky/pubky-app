import { readFileSync } from 'fs';
import { basename, extname } from 'path';
import {
  AuthFlowKind,
  Keypair,
  Pubky,
  PublicKey,
  SignupGrantDeepLink,
  type Capabilities,
  type Path,
  type Session,
} from '@synonymdev/pubky';
import { PubkyAppPost, PubkyAppPostEmbed, PubkyAppPostKind, PubkySpecsBuilder } from 'pubky-app-specs';
import type {
  SeedAddToCollectionArgs,
  SeedBookmarkArgs,
  SeedCreateCollectionArgs,
  SeedCreateLockPostArgs,
  SeedCreatePostArgs,
  SeedCreateUserArgs,
  SeedDeletePostArgs,
  SeedEditPostArgs,
  SeededLockPost,
  SeededPost,
  SeededPostKind,
  SeededSignUp,
  SeededUser,
  SeedApprovePubkyAuthArgs,
  SeedFollowArgs,
  SeedLockServerWriteArgs,
  SeedMarkNotificationsReadArgs,
  SeedSignUpArgs,
  SeedTagArgs,
} from '../support/types/seed';

/**
 * Node side of the spec seeding helpers in `cypress/support/seed.ts`.
 *
 * Specs set up the users and activity a test only observes through the same Pubky libraries the
 * app writes with (`@synonymdev/pubky` + `pubky-app-specs`), straight against the test stack's
 * homeserver. Nexus indexes those writes exactly as it indexes the app's, so feeds, notifications
 * and pagination are still exercised end to end; only the setup clicks are skipped.
 */

export type SeedConfig = {
  homeserverAdminUrl: string;
  homeserverAdminPassword: string;
  homeserverPublicKey: string;
  nexusUrl: string;
};

const SEED_CLIENT_ID = 'e2e-seed.pubky.app';
// What a real Lock Server asks the creator to grant it, and the only scopes it writes with
// (pubky/locks `locks_connect_capabilities`)
const LOCK_SERVER_CAPABILITIES: Capabilities = '/priv/app.locks/:rw,/pub/app.locks/:rw';
const LOCK_SERVER_CLIENT_ID = 'lock-server.e2e.test';
// Consecutive seed writes start at least this far apart, so records a test orders by time
// (timelines, threads, notifications) never share a timestamp
const SEED_WRITE_SPACING_MS = 5;
// Matches the `mustache-*.png` fixtures; extend when a spec seeds another image type
const IMAGE_CONTENT_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg' };

const POST_KINDS: Record<SeededPostKind, PubkyAppPostKind> = {
  short: PubkyAppPostKind.Short,
  long: PubkyAppPostKind.Long,
  image: PubkyAppPostKind.Image,
  collection: PubkyAppPostKind.Collection,
};

type SeededSession = { name: string; session: Session; builder: PubkySpecsBuilder };

const toPath = (path: string): Path => {
  if (!path.startsWith('/pub/')) {
    throw new Error(`expected a /pub/ homeserver path, got ${path}`);
  }
  return path as Path;
};

const postPath = (postId: string) => toPath(`/pub/pubky.app/posts/${postId}`);

const lockServerPath = (path: string): Path => {
  if (!path.startsWith('/pub/app.locks/') && !path.startsWith('/priv/app.locks/')) {
    throw new Error(`the Lock Server only writes under /pub/app.locks/ and /priv/app.locks/, got ${path}`);
  }
  return path as Path;
};

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
  // The key behind each signed-up name, for the mock Pubky Ring to approve sign-ins with. A name
  // signed up again maps to its newest key, as a spec re-creating a user expects.
  const keypairs = new Map<string, Keypair>();
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
  const keypairFor = (name: string): Keypair => {
    const keypair = keypairs.get(name);
    if (!keypair) {
      throw new Error(`no key was signed up for '${name}' in this Cypress run`);
    }
    return keypair;
  };
  const keypairOf = (userId: string): Keypair => {
    const keypair = [...keypairs.values()].find((candidate) => candidate.publicKey.z32() === userId);
    if (!keypair) {
      throw new Error(`no key was signed up for ${userId} in this Cypress run`);
    }
    return keypair;
  };
  // The relay of the app's own Pubky Ring requests, which the stand-in Lock Server's grant uses too
  let relay: string | undefined;
  // One creator-granted session per creator, reused across that creator's locks as the Lock Server does
  const lockServerSessions = new Map<string, Promise<Session>>();
  const lockServerSessionFor = (owner: string): Promise<Session> => {
    const existing = lockServerSessions.get(owner);
    if (existing) return existing;
    const granted = (async () => {
      if (!relay) {
        throw new Error('no sign-in has gone through the mock Pubky Ring yet, so the relay is unknown');
      }
      const flow = await pubky().startGrantAuthFlow(LOCK_SERVER_CAPABILITIES, AuthFlowKind.signin(), {
        clientId: LOCK_SERVER_CLIENT_ID,
        relay,
      });
      const approval = flow.awaitApproval();
      // If the approval below fails, `approval` is never awaited and later rejects when the relay
      // channel expires; without a handler that surfaces as a plugin error far from the cause
      approval.catch(() => undefined);
      await pubky().signer(keypairOf(owner)).approveAuthRequest(flow.authorizationUrl);
      return approval;
    })();
    granted.catch(() => lockServerSessions.delete(owner));
    lockServerSessions.set(owner, granted);
    return granted;
  };
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

  // Creates a new key and signs it up on `homeserver` with `signupToken`, as Pubky Ring does
  const signUpKey = async (name: string, homeserver: PublicKey, signupToken: string) => {
    const keypair = Keypair.random();
    await pubky().signer(keypair).signup(homeserver, signupToken);
    keypairs.set(name, keypair);
    return keypair;
  };

  // Signs a new key up on the test homeserver with a fresh signup token
  const signUp = async (name: string) => {
    const inviteCode = await fetchSignupToken();
    const keypair = await signUpKey(name, PublicKey.from(config.homeserverPublicKey), inviteCode);
    return { keypair, inviteCode };
  };

  // Sends the grant for the app's request through its relay, as Ring does when the user taps Authorize
  const approvePubkyAuth = async (name: string, authUrl: string) => {
    relay = new URL(authUrl).searchParams.get('relay') ?? relay;
    await pubky().signer(keypairFor(name)).approveAuthRequest(authUrl);
  };

  const putTag = async (tagger: SeededSession, uri: string, label: string) => {
    const tag = tagger.builder.createTag(uri, label);
    await tagger.session.storage.putJson(toPath(tag.meta.path), tag.tag.toJson());
    return tag.meta.id;
  };

  // Same three writes as the app's image upload: the blob, its file record, then the post points at the file
  const uploadImage = async (author: SeededSession, imagePath: string) => {
    const contentType = IMAGE_CONTENT_TYPES[extname(imagePath).toLowerCase()];
    if (!contentType) {
      throw new Error(`no content type for ${imagePath}`);
    }
    const bytes = new Uint8Array(readFileSync(imagePath));
    const blob = author.builder.createBlob(bytes);
    await author.session.storage.putBytes(toPath(blob.meta.path), blob.blob.data);
    const file = author.builder.createFile(basename(imagePath), blob.meta.url, contentType, bytes.length);
    await author.session.storage.putJson(toPath(file.meta.path), file.file.toJson());
    return file.meta.url;
  };

  const readPost = async (author: SeededSession, postId: string) =>
    PubkyAppPost.fromJson(await author.session.storage.getJson(postPath(postId)));

  return {
    // The key Pubky Ring would create and sign up, without a profile: signing the app in with it
    // lands on the Profile step
    seedSignUp: ({ name }: SeedSignUpArgs): Promise<SeededSignUp> =>
      step(`sign up key for '${name}'`, async () => {
        const { keypair, inviteCode } = await signUp(name);
        const id = keypair.publicKey.z32();
        return { id, pubky: `pubky${id}`, inviteCode };
      }),

    // Mock Pubky Ring: approves the app's `pubkyauth://` request as the key signed up for `name`
    seedApprovePubkyAuth: ({ name, authUrl }: SeedApprovePubkyAuthArgs) =>
      step(`approve sign-in as '${name}' in mock Pubky Ring`, async () => {
        await approvePubkyAuth(name, authUrl);
        return null;
      }),

    // Mock Pubky Ring handling the app's sign-up request (pubky-ring `signupAction`): a new key signs up
    // on the request's homeserver (`hs`) with its signup token (`st`), then approves the request's grant.
    // The SDK approves a `signup_grant` link with the same grant as the `signin_grant` Ring rebuilds from it.
    seedSignUpAndApprovePubkyAuth: ({ name, authUrl }: SeedApprovePubkyAuthArgs): Promise<SeededSignUp> =>
      step(`sign up and approve as '${name}' in mock Pubky Ring`, async () => {
        const { homeserver, signupToken } = SignupGrantDeepLink.parse(authUrl);
        if (!signupToken) {
          throw new Error('the sign-up request carries no signup token');
        }
        const keypair = await signUpKey(name, homeserver, signupToken);
        await approvePubkyAuth(name, authUrl);
        const id = keypair.publicKey.z32();
        return { id, pubky: `pubky${id}`, inviteCode: signupToken };
      }),

    // Stand-in Lock Server: the homeserver writes the real one makes for a creator before it answers
    // (guarded bytes, lock.json), with the session the creator granted it in Pubky Ring, not the app's
    seedLockServerWrite: ({ owner, path, bytes }: SeedLockServerWriteArgs) =>
      step(`Lock Server ${bytes === undefined ? 'deletes' : 'writes'} ${path} for '${nameOf(owner)}'`, async () => {
        const { storage } = await lockServerSessionFor(owner);
        if (bytes === undefined) {
          await storage.delete(lockServerPath(path));
        } else {
          await storage.putBytes(lockServerPath(path), Buffer.from(bytes, 'base64'));
        }
        return null;
      }),

    seedCreateUser: ({ name, bio }: SeedCreateUserArgs): Promise<SeededUser> =>
      step(`create user '${name}'`, async () => {
        const { keypair } = await signUp(name);
        const session = await pubky().signer(keypair).signin(SEED_CLIENT_ID);
        const id = keypair.publicKey.z32();
        const builder = new PubkySpecsBuilder(id);
        // profile.json is what makes the app treat the key as signed up
        const profile = builder.createUser(name, bio, null, null, null);
        await session.storage.putJson(toPath(profile.meta.path), profile.user.toJson());
        // Like the app after onboarding, tell Nexus about the new user; best effort, as in the app
        await fetch(`${config.nexusUrl.replace(/\/$/, '')}/v0/ingest/${id}`, { method: 'PUT' }).catch(() => null);
        sessions.set(id, { name, session, builder });
        return { id, pubky: `pubky${id}`, uri: profile.meta.url, name };
      }),

    seedCreatePost: (args: SeedCreatePostArgs): Promise<SeededPost> =>
      step(`create ${args.kind} post by '${nameOf(args.authorId)}': "${preview(args.content)}"`, async () => {
        const author = sessionFor(args.authorId);
        const attachments = args.imageFixturePath ? [await uploadImage(author, args.imageFixturePath)] : null;
        const embed = args.embed ? new PubkyAppPostEmbed(args.embed.uri, POST_KINDS[args.embed.kind]) : null;
        const post = author.builder.createPost(
          args.content,
          POST_KINDS[args.kind],
          args.parentUri ?? null,
          embed,
          attachments,
        );
        await author.session.storage.putJson(toPath(post.meta.path), post.post.toJson());
        // The app tags a post created with tags as its author, after the post itself
        for (const label of args.tags ?? []) {
          await putTag(author, post.meta.url, label);
        }
        return { id: post.meta.id, authorId: args.authorId, uri: post.meta.url, kind: args.kind };
      }),

    seedEditPost: ({ authorId, postId, content }: SeedEditPostArgs) =>
      step(`edit post ${postId} by '${nameOf(authorId)}'`, async () => {
        const author = sessionFor(authorId);
        const edited = author.builder.editPost(await readPost(author, postId), postId, content);
        await author.session.storage.putJson(toPath(edited.meta.path), edited.post.toJson());
        return { id: postId };
      }),

    seedDeletePost: ({ authorId, postId }: SeedDeletePostArgs) =>
      step(`delete post ${postId} by '${nameOf(authorId)}'`, async () => {
        await sessionFor(authorId).session.storage.delete(postPath(postId));
        return { id: postId };
      }),

    seedTag: ({ taggerId, uri, label }: SeedTagArgs) =>
      step(`tag ${uri} as '${label}' by '${nameOf(taggerId)}'`, async () => ({
        id: await putTag(sessionFor(taggerId), uri, label),
      })),

    seedFollow: ({ followerId, followeeId }: SeedFollowArgs) =>
      step(`'${nameOf(followerId)}' follows '${nameOf(followeeId)}'`, async () => {
        const follower = sessionFor(followerId);
        const follow = follower.builder.createFollow(followeeId);
        await follower.session.storage.putJson(toPath(follow.meta.path), follow.follow.toJson());
        return { id: followeeId };
      }),

    seedBookmark: ({ userId, uri }: SeedBookmarkArgs) =>
      step(`bookmark ${uri} by '${nameOf(userId)}'`, async () => {
        const user = sessionFor(userId);
        const bookmark = user.builder.createBookmark(uri);
        await user.session.storage.putJson(toPath(bookmark.meta.path), bookmark.bookmark.toJson());
        return { id: bookmark.meta.id };
      }),

    seedMarkNotificationsRead: ({ userId }: SeedMarkNotificationsReadArgs) =>
      step(`mark notifications read for '${nameOf(userId)}'`, async () => {
        const user = sessionFor(userId);
        const lastRead = user.builder.createLastRead();
        await user.session.storage.putJson(toPath(lastRead.meta.path), lastRead.last_read.toJson());
        return { timestamp: Number(lastRead.last_read.timestamp) };
      }),

    seedCreateCollection: ({
      authorId,
      name,
      description,
      items,
      layout,
    }: SeedCreateCollectionArgs): Promise<SeededPost> =>
      step(`create collection '${name}' by '${nameOf(authorId)}'`, async () => {
        const author = sessionFor(authorId);
        const collection = author.builder.createCollectionPost(name, description, items, null, layout);
        await author.session.storage.putJson(toPath(collection.meta.path), collection.post.toJson());
        return { id: collection.meta.id, authorId, uri: collection.meta.url, kind: 'collection' };
      }),

    // Rewrites the collection post with the item first, as saving a post into a collection does in the app
    seedAddToCollection: ({ authorId, collectionId, itemUri }: SeedAddToCollectionArgs) =>
      step(`add ${itemUri} to collection ${collectionId} by '${nameOf(authorId)}'`, async () => {
        const author = sessionFor(authorId);
        const current = await readPost(author, collectionId);
        const content = JSON.parse(current.content);
        const nextContent = JSON.stringify({ ...content, items: [itemUri, ...(content.items ?? [])] });
        const edited = author.builder.editPost(current, collectionId, nextContent);
        await author.session.storage.putJson(toPath(edited.meta.path), edited.post.toJson());
        return { id: collectionId };
      }),

    // A paid lock as the Lock Server leaves it (the public lock.json), then its announcement as the
    // composer posts it. The locked post itself is only ever read through the Lock Server, so it is
    // returned for the spec's stub to serve rather than written under /priv.
    seedCreateLockPost: ({
      authorId,
      title,
      teaser,
      lockedContent,
      amount,
    }: SeedCreateLockPostArgs): Promise<SeededLockPost> =>
      step(`create lock post by '${nameOf(authorId)}': "${preview(teaser)}"`, async () => {
        const author = sessionFor(authorId);
        const lockId = `e2eseed${Date.now()}`;
        const guardedPath = `post-${lockId}`;
        const guardedPost = Buffer.from(JSON.stringify({ content: lockedContent, kind: 'short', attachments: null }));
        const lockPath = `/pub/app.locks/${lockId}.json`;
        await author.session.storage.putJson(toPath(lockPath), {
          version: 1,
          creator: `pubky${authorId}`,
          primary_resource: {
            path: `/priv/app.locks/content/${guardedPath}`,
            hash: `e2e-${guardedPath}`,
            content_type: 'application/json',
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
        const content = JSON.stringify({ lock_title: title, teaser_description: teaser, content_kind: 'note' });
        const post = author.builder.createPost(
          content,
          PubkyAppPostKind.Short,
          null,
          null,
          null,
          `pubky://${authorId}${lockPath}`,
        );
        await author.session.storage.putJson(toPath(post.meta.path), post.post.toJson());
        return {
          id: post.meta.id,
          authorId,
          uri: post.meta.url,
          kind: 'short',
          lockId,
          guardedPath,
          guardedBytes: guardedPost.toString('base64'),
        };
      }),
  };
};
