import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, extname } from 'path';
import { Keypair, Pubky, PublicKey, type Path, type Session } from '@synonymdev/pubky';
import { PubkyAppPost, PubkyAppPostEmbed, PubkyAppPostKind, PubkySpecsBuilder } from 'pubky-app-specs';
import type {
  SeedAddToCollectionArgs,
  SeedBookmarkArgs,
  SeedCreateCollectionArgs,
  SeedCreatePostArgs,
  SeedCreateUserArgs,
  SeedDeletePostArgs,
  SeedEditPostArgs,
  SeededPost,
  SeededPostKind,
  SeededUser,
  SeedFollowArgs,
  SeedMarkNotificationsReadArgs,
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

// The passcode `cy.signInWithEncryptedFile` types by default
const RECOVERY_FILE_PASSCODE = '123456';
const SEED_CLIENT_ID = 'e2e-seed.pubky.app';
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
    seedCreateUser: ({ name, bio, recoveryFilePath }: SeedCreateUserArgs): Promise<SeededUser> =>
      step(`create user '${name}'`, async () => {
        const keypair = Keypair.random();
        const signer = pubky().signer(keypair);
        await signer.signup(PublicKey.from(config.homeserverPublicKey), await fetchSignupToken());
        const session = await signer.signin(SEED_CLIENT_ID);
        const id = keypair.publicKey.z32();
        const builder = new PubkySpecsBuilder(id);
        // profile.json is what makes the app treat the key as signed up
        const profile = builder.createUser(name, bio, null, null, null);
        await session.storage.putJson(toPath(profile.meta.path), profile.user.toJson());
        if (recoveryFilePath) {
          mkdirSync(dirname(recoveryFilePath), { recursive: true });
          writeFileSync(recoveryFilePath, keypair.createRecoveryFile(RECOVERY_FILE_PASSCODE));
        }
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
  };
};
