import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { basename, extname } from 'path';
import type { Path, Session } from '@synonymdev/pubky';
import {
  buildBookmark,
  buildFile,
  buildFollow,
  buildMute,
  buildPost,
  buildTag,
  buildUri,
  buildUser,
  dateToMicros,
  decodeObject,
  deletionPaths,
  editPost,
  toPath,
} from 'pubky-social-specs';
import {
  APP_LAST_READ_FILE,
  APP_PRIVATE_PATH,
  APP_SETTINGS_FILE,
  LEGACY_SETTINGS_PATH,
} from '../../src/config/app-files';
import { LOCKS_GUARDED_CONTENT_PATH, PAYKIT_PAYMENT_IN_HOURS } from '../../src/config/locks';
import type {
  SeedCreateCollectionArgs,
  SeedCreatePostArgs,
  SeededLegacyLock,
  SeededPostKind,
  SeedLegacyLockArgs,
} from '../support/types/seed';

/**
 * The homeserver writes behind the seed tasks, one writer per data epoch.
 *
 * - `v1Writer` writes what the app writes today, through `pubky-social-specs`.
 * - `legacyWriter` writes what a 0.x client wrote under `/pub/pubky.app/`, spelled by hand because
 *   the 0.x package is gone. Nexus reads such a user through its 0.x reader until they migrate, and
 *   only a sign-in migrates them, so a supporting user who never signs in stays un-migrated: that
 *   is the coverage for content the app renders from users who have not come back yet. Its
 *   `writeLock` also writes the files the Lock Server kept for a 0.x lock (`/priv/app.locks/content/`
 *   and `/pub/app.locks/`).
 *
 * Each writer spells a reference the way its own clients do, whichever epoch the target is on, so
 * a seeded thread exercises both spellings of one post.
 */

type StoredPost = { id: string; uri: string };
type PostInput = Pick<SeedCreatePostArgs, 'content' | 'kind' | 'title' | 'parentUri' | 'embed' | 'imageFixturePath'>;
type CollectionInput = Pick<SeedCreateCollectionArgs, 'name' | 'description' | 'items' | 'layout'>;
type LockInput = Pick<SeedLegacyLockArgs, 'lockedText' | 'teaser' | 'price' | 'imageFixturePath'>;

export type SeedWriter = {
  /** Writes the profile, which makes the app treat the key as signed up; yields the URI a tag targets. */
  writeProfile: (name: string, bio: string) => Promise<string>;
  writePost: (post: PostInput) => Promise<StoredPost>;
  editPost: (postId: string, content: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  writeTag: (uri: string, label: string) => Promise<string>;
  writeFollow: (followeeId: string) => Promise<void>;
  writeBookmark: (uri: string) => Promise<void>;
  writeMute: (muteeId: string) => Promise<void>;
  writeCollection: (collection: CollectionInput) => Promise<StoredPost>;
  /** Publishes a locked image post as the Lock Server left it, with its public announcement. */
  writeLock: (lock: LockInput) => Promise<SeededLegacyLock>;
  writeLastRead: (timestamp: number) => Promise<void>;
  writeSettings: (settings: Record<string, unknown>) => Promise<void>;
};

const LEGACY_SEGMENT = '/pub/pubky.app/';
const V1_SEGMENT = '/pub/social/v1/';

// A post and a profile sit at the same place under both roots, so a reference moves by its root alone
const toV1Reference = (uri: string) => uri.replace(LEGACY_SEGMENT, V1_SEGMENT);
const toLegacyReference = (uri: string) => uri.replace(V1_SEGMENT, LEGACY_SEGMENT);

// Matches the `mustache-*.png` fixtures; extend when a spec seeds another image type
const IMAGE_CONTENT_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg' };

const readImage = (imagePath: string) => {
  const type = IMAGE_CONTENT_TYPES[extname(imagePath).toLowerCase()];
  if (!type) {
    throw new Error(`no content type for ${imagePath}`);
  }
  return { bytes: new Uint8Array(readFileSync(imagePath)), type, name: basename(imagePath) };
};

export const v1Writer = (owner: string, session: Session): SeedWriter => {
  const put = ({ path, body }: { path: string; body: Uint8Array }) => session.storage.putBytes(path as Path, body);

  // A post is a directory of versions, one URL each, whose names sort by the time they were written
  const listVersions = async (postId: string) =>
    (await session.storage.list(`${toPath(buildUri(owner, 'post', postId))}/` as Path)).sort();

  return {
    writeProfile: async (name, bio) => {
      await put(buildUser(owner, { name, bio: bio || null }));
      return buildUri(owner, 'user');
    },

    // Same two writes as the app's upload: the media under its content hash, then the post pointing at it.
    // An article names its image as the cover, in its envelope; any other post attaches it.
    writePost: async ({ content, kind, title, parentUri, embed, imageFixturePath }) => {
      const image = imageFixturePath ? readImage(imageFixturePath) : null;
      const media = image ? buildFile(owner, { bytes: image.bytes, type: image.type }) : null;
      if (image && media) {
        await session.storage.putBytes(media.path as Path, image.bytes);
      }
      const parent = parentUri ? toV1Reference(parentUri) : null;
      const embedded = embed ? toV1Reference(embed.uri) : null;
      const post =
        kind === 'article'
          ? buildPost(owner, {
              kind,
              title: title ?? '',
              body: content,
              cover_image: media?.url ?? null,
              parent,
              embed: embedded,
            })
          : buildPost(owner, {
              kind: kind === 'image' ? 'image' : 'note',
              content,
              parent,
              embed: embedded,
              attachments: image && media ? [{ uri: media.url, name: image.name }] : [],
            });
      await put(post);
      return { id: post.id, uri: buildUri(owner, 'post', post.id) };
    },

    editPost: async (postId, content) => {
      const headUrl = (await listVersions(postId)).at(-1);
      if (!headUrl) {
        throw new Error(`post ${postId} has no stored version`);
      }
      const head = decodeObject(headUrl, await session.storage.getBytes(toPath(headUrl) as Path), 'post');
      await put(editPost(owner, headUrl, { ...head, content }));
    },

    deletePost: async (postId) => {
      const listings = (await listVersions(postId)).map((url) => toPath(url));
      for (const path of deletionPaths({ kind: 'post', id: postId, listings })) {
        await session.storage.delete(path as Path);
      }
    },

    writeTag: async (uri, label) => {
      const tag = buildTag(owner, toV1Reference(uri), label);
      await put(tag);
      return tag.id;
    },

    writeFollow: async (followeeId) => {
      await put(buildFollow(owner, followeeId));
    },

    writeBookmark: async (uri) => {
      await put(buildBookmark(owner, toV1Reference(uri)));
    },

    writeMute: async (muteeId) => {
      await put(buildMute(owner, muteeId));
    },

    writeLastRead: async (timestamp) => {
      await session.storage.putJson(`${APP_PRIVATE_PATH}${APP_LAST_READ_FILE}` as Path, { timestamp });
    },

    writeSettings: async (settings) => {
      await session.storage.putJson(`${APP_PRIVATE_PATH}${APP_SETTINGS_FILE}` as Path, settings);
    },

    writeCollection: async ({ name, description, items, layout }) => {
      const collection = buildPost(owner, {
        kind: 'collection',
        name,
        description,
        items: items.map((uri) => ({ uri: toV1Reference(uri) })),
        layout,
      });
      await put(collection);
      return { id: collection.id, uri: buildUri(owner, 'post', collection.id) };
    },

    // A v1 lock is published through the composer against the stand-in Lock Server (locks.cy.ts); only
    // a lock from before the migration has to be seeded, and that is the legacy writer's.
    writeLock: () => {
      throw new Error('a lock is seeded for an un-migrated account only; publish a v1 one through the app');
    },
  };
};

const LEGACY_POST_KINDS: Record<SeededPostKind, string> = {
  note: 'short',
  image: 'image',
  article: 'long',
  collection: 'collection',
};

// `buildTag` hashes a tag as 0.x did only for these inputs: 0.x also normalised a web URL target and lower-cased
// non-ASCII labels. No spec seeds either, and an id that drifted from the 0.x one would not fail anywhere else.
const assertLegacyTagHashesAlike = (target: string, label: string) => {
  if (!target.startsWith('pubky://') || !/^[ -~]*$/.test(label)) {
    throw new Error(`the legacy writer cannot spell a 0.x tag id for ${target} as '${label}'`);
  }
};

export const legacyWriter = (owner: string, session: Session): SeedWriter => {
  const legacyPath = (rest: string) => `${LEGACY_SEGMENT}${rest}` as Path;
  const legacyUrl = (rest: string) => `pubky://${owner}${LEGACY_SEGMENT}${rest}`;
  const nowMicros = () => dateToMicros(Date.now());

  // A timestamp id, spelled the same in both epochs; building a post that is never stored mints one
  const mintId = () => buildPost(owner, { content: 'id' }).id;

  const writeStoredPost = async (body: Record<string, unknown>) => {
    const id = mintId();
    await session.storage.putJson(legacyPath(`posts/${id}`), body);
    return { id, uri: legacyUrl(`posts/${id}`) };
  };

  return {
    writeProfile: async (name, bio) => {
      await session.storage.putJson(legacyPath('profile.json'), { name, bio });
      return legacyUrl('profile.json');
    },

    // Same three writes as a 0.x client's upload: the blob, its file record, then the post pointing at the file.
    // A 0.x article keeps its cover in the first attachment and its title and body in an envelope.
    writePost: async ({ content, kind, title, parentUri, embed, imageFixturePath }) => {
      const body: Record<string, unknown> = {
        content: kind === 'article' ? JSON.stringify({ title: title ?? '', body: content }) : content,
        kind: LEGACY_POST_KINDS[kind],
      };
      if (parentUri) body['parent'] = toLegacyReference(parentUri);
      if (embed) body['embed'] = { uri: toLegacyReference(embed.uri), kind: LEGACY_POST_KINDS[embed.kind] };
      if (imageFixturePath) {
        const { bytes, type, name } = readImage(imageFixturePath);
        // A 0.x blob id is the hash a v1 media id is
        const blobId = buildFile(owner, { bytes, type }).id;
        await session.storage.putBytes(legacyPath(`blobs/${blobId}`), bytes);
        const fileId = mintId();
        await session.storage.putJson(legacyPath(`files/${fileId}`), {
          name,
          created_at: nowMicros(),
          src: legacyUrl(`blobs/${blobId}`),
          content_type: type,
          size: bytes.length,
        });
        body['attachments'] = [legacyUrl(`files/${fileId}`)];
      }
      return writeStoredPost(body);
    },

    // A 0.x edit overwrites the post where it is
    editPost: async (postId, content) => {
      const path = legacyPath(`posts/${postId}`);
      await session.storage.putJson(path, { ...(await session.storage.getJson(path)), content });
    },

    deletePost: async (postId) => {
      await session.storage.delete(legacyPath(`posts/${postId}`));
    },

    writeTag: async (uri, label) => {
      const target = toLegacyReference(uri);
      assertLegacyTagHashesAlike(target, label);
      // A 0.x tag id hashes its target and label the way a v1 one does
      const { id, object } = buildTag(owner, target, label);
      await session.storage.putJson(legacyPath(`tags/${id}`), {
        uri: target,
        label: object.label,
        created_at: nowMicros(),
      });
      return id;
    },

    writeFollow: async (followeeId) => {
      await session.storage.putJson(legacyPath(`follows/${followeeId}`), { created_at: nowMicros() });
    },

    writeBookmark: async (uri) => {
      const target = toLegacyReference(uri);
      // A 0.x bookmark id hashes its target the way a v1 media id hashes its bytes
      const { id } = buildFile(owner, { bytes: new TextEncoder().encode(target), type: 'image/png' });
      await session.storage.putJson(legacyPath(`bookmarks/${id}`), { uri: target, created_at: nowMicros() });
    },

    writeMute: async (muteeId) => {
      await session.storage.putJson(legacyPath(`mutes/${muteeId}`), { created_at: nowMicros() });
    },

    writeLastRead: async (timestamp) => {
      await session.storage.putJson(legacyPath('last_read'), { timestamp });
    },

    writeSettings: async (settings) => {
      await session.storage.putJson(LEGACY_SETTINGS_PATH as Path, settings);
    },

    writeCollection: ({ name, description, items, layout }) =>
      writeStoredPost({
        content: JSON.stringify({ name, description, items: items.map(toLegacyReference), layout }),
        kind: LEGACY_POST_KINDS.collection,
      }),

    // What a 0.x client left behind after publishing a lock (`docs/locks.md`, Where the data lives): the
    // guarded image and the guarded post, a 0.x `PubkyAppPost` JSON naming the image by its guarded URI,
    // under `/priv/app.locks/content/`; the public lock file; and the announcement, a 0.x `short` post
    // whose `content` is the teaser envelope and whose top-level `lock` names the lock file. The Lock
    // Server wrote the first three with the creator's session, so a root session writes them the same way.
    // The hashes are the stand-in Lock Server's spelling (`cypress/support/locks.ts`): nothing reads them.
    writeLock: async ({ lockedText, teaser, price, imageFixturePath }) => {
      const image = readImage(imageFixturePath);
      const imageTail = randomUUID();
      const postTail = randomUUID();
      const guardedPath = (tail: string) => `${LOCKS_GUARDED_CONTENT_PATH}${tail}`;
      await session.storage.putBytes(guardedPath(imageTail) as Path, image.bytes);
      const guardedPost = {
        content: lockedText,
        kind: LEGACY_POST_KINDS.image,
        parent: null,
        embed: null,
        attachments: [`pubky://${owner}${guardedPath(imageTail)}`],
      };
      const postBytes = new TextEncoder().encode(JSON.stringify(guardedPost));
      await session.storage.putBytes(guardedPath(postTail) as Path, postBytes);

      const lockId = `legacy${Date.now()}`;
      const lockFile = {
        version: 1,
        creator: `pubky${owner}`,
        primary_resource: {
          path: guardedPath(postTail),
          hash: `e2e-${postTail}`,
          content_type: 'application/octet-stream',
          size: postBytes.length,
        },
        secondary_resources: {
          [guardedPath(imageTail)]: { hash: `e2e-${imageTail}`, content_type: image.type, size: image.bytes.length },
        },
        criteria: [
          {
            criterion_id: 'criterion-1',
            verifier_type: 'paykit-payment',
            params: {
              recipient_pubky: `pubky${owner}`,
              amount: price.amount,
              asset: price.asset,
              payment_in: PAYKIT_PAYMENT_IN_HOURS,
            },
          },
        ],
        lock_logic: { type: 'all', criteria: ['criterion-1'] },
        access_policy: { requested_credential_ttl_seconds: 900 },
        lock_server: { override: null },
      };
      const lockPath = `/pub/app.locks/${lockId}.json`;
      await session.storage.putJson(lockPath as Path, lockFile);
      const lockUrl = `pubky://${owner}${lockPath}`;

      const post = await writeStoredPost({
        content: JSON.stringify(teaser),
        kind: LEGACY_POST_KINDS.note,
        lock: lockUrl,
      });
      const { params } = lockFile.criteria[0]!;
      return {
        post: { ...post, authorId: owner, kind: 'note' },
        lockId,
        lockUrl,
        price: { amount: params.amount, asset: params.asset, recipient: params.recipient_pubky },
        guarded: {
          [postTail]: Buffer.from(postBytes).toString('base64'),
          [imageTail]: Buffer.from(image.bytes).toString('base64'),
        },
      };
    },
  };
};
