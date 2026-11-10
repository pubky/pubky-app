import type { NexusCheck, NexusNotificationType } from './types/nexus';
import type { SeededPost, SeededUser } from './types/seed';

const NEXUS_WAIT_TIMEOUT_MS = 60_000;
// Enough to see every notification a spec gives one receiver
const NOTIFICATIONS_LIMIT = 100;
// The most labels a spec puts on one post or profile (feed.cy.ts tags Profile 3's post five times)
const TAGS_LIMIT = 5;
// More than a spec's thread holds
const REPLIES_LIMIT = 20;

/**
 * Waits until Nexus has indexed every record in `checks`, polling them together (plugins/nexus.ts),
 * then yields each check's last response body in order. Call it once per phase, with every record
 * the following assertions read from Nexus and nothing they do not, so the phase costs one indexing
 * delay. Fails naming the records still missing.
 */
export const waitForNexus = (...checks: NexusCheck[]): Cypress.Chainable<unknown[]> => {
  cy.log(`Waiting for Nexus to index ${checks.map((check) => check.description).join('; ')}`);
  return cy.task<unknown[]>(
    'nexusWaitAll',
    { checks, timeoutMs: NEXUS_WAIT_TIMEOUT_MS },
    { timeout: NEXUS_WAIT_TIMEOUT_MS + 10_000, log: false },
  );
};

export const userIndexed = (user: SeededUser): NexusCheck => ({
  description: `user '${user.name}'`,
  path: `/v1/user/${user.id}`,
  expect: { kind: 'found' },
});

// The search the @mention popover and header search run, which Nexus fills separately from the user record
export const userSearchIndexed = (user: SeededUser): NexusCheck => ({
  description: `user '${user.name}' in name search`,
  path: `/v1/search/users/by_name/${encodeURIComponent(user.name)}`,
  expect: { kind: 'includes', value: user.id },
});

export const postIndexed = (post: Pick<SeededPost, 'id' | 'authorId'>): NexusCheck => ({
  description: `post ${post.id}`,
  path: `/v1/post/${post.authorId}/${post.id}`,
  expect: { kind: 'found' },
});

// The post as an edit left it, which a post that was already indexed answers `found` to long before
export const postContentIndexed = (post: Pick<SeededPost, 'id' | 'authorId'>, text: string): NexusCheck => ({
  description: `post ${post.id} holding "${text}"`,
  path: `/v1/post/${post.authorId}/${post.id}`,
  expect: { kind: 'content', text },
});

export const postGone = (post: Pick<SeededPost, 'id' | 'authorId'>): NexusCheck => ({
  description: `post ${post.id} deleted`,
  path: `/v1/post/${post.authorId}/${post.id}`,
  expect: { kind: 'gone' },
});

export const followIndexed = (follower: SeededUser, followee: SeededUser): NexusCheck => ({
  description: `'${follower.name}' following '${followee.name}'`,
  path: `/v1/user/${followee.id}/followers`,
  expect: { kind: 'includes', value: follower.id },
});

export const followGone = (follower: SeededUser, followee: SeededUser): NexusCheck => ({
  description: `'${follower.name}' no longer following '${followee.name}'`,
  path: `/v1/user/${followee.id}/followers`,
  expect: { kind: 'excludes', value: follower.id },
});

export const postTagsIndexed = (post: Pick<SeededPost, 'id' | 'authorId'>, labels: string[]): NexusCheck => ({
  description: `tags ${labels.join(', ')} on post ${post.id}`,
  path: `/v1/post/${post.authorId}/${post.id}/tags`,
  qs: { limit_tags: String(TAGS_LIMIT) },
  expect: { kind: 'tags', labels },
});

export const postTagGone = (post: Pick<SeededPost, 'id' | 'authorId'>, label: string): NexusCheck => ({
  description: `no tag ${label} on post ${post.id}`,
  path: `/v1/post/${post.authorId}/${post.id}/tags`,
  qs: { limit_tags: String(TAGS_LIMIT) },
  expect: { kind: 'noTag', label },
});

export const userTagsIndexed = (user: SeededUser, labels: string[]): NexusCheck => ({
  description: `tags ${labels.join(', ')} on user '${user.name}'`,
  path: `/v1/user/${user.id}/tags`,
  qs: { limit_tags: String(TAGS_LIMIT) },
  expect: { kind: 'tags', labels },
});

/**
 * `count` notifications of `type` for `receiver` (from `actor`, when given), so the receiver's
 * first sign-in already finds them instead of racing the indexer.
 */
export const notificationsIndexed = (
  receiver: SeededUser,
  type: NexusNotificationType,
  { actor, count = 1 }: { actor?: SeededUser; count?: number } = {},
): NexusCheck => ({
  description: `${count} ${type} notification(s) for '${receiver.name}'${actor ? ` from '${actor.name}'` : ''}`,
  path: `/v1/user/${receiver.id}/notifications`,
  qs: { limit: String(NOTIFICATIONS_LIMIT) },
  expect: { kind: 'notifications', type, actorId: actor?.id, count },
});

// Every id in `postIds` listed by the `/v1/stream/posts/keys` stream `query` (first `limit` keys)
export const streamIndexed = (query: Record<string, string>, postIds: string[], limit: number): NexusCheck => ({
  description: `${postIds.length} posts in stream ${JSON.stringify(query)}`,
  path: '/v1/stream/posts/keys',
  qs: { ...query, limit: String(limit) },
  expect: { kind: 'streamKeys', postIds },
});

// The replies under `parent`, which is what a thread renders from
export const repliesIndexed = (parent: Pick<SeededPost, 'id' | 'authorId'>, replies: Pick<SeededPost, 'id'>[]) =>
  streamIndexed(
    { source: 'post_replies', author_id: parent.authorId, post_id: parent.id },
    replies.map((reply) => reply.id),
    REPLIES_LIMIT,
  );

// Homeserver write bodies reach the intercept as a string, raw bytes or parsed JSON depending on the browser.
export const parseRequestBody = (body: unknown): unknown => {
  if (typeof body === 'string') return JSON.parse(body);
  if (body instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(body));
  if (ArrayBuffer.isView(body)) return JSON.parse(new TextDecoder().decode(body));
  return body;
};

// Reads the tagged post's author and id from a homeserver tag PUT interception.
export const taggedPostFromInterception = (interception: { request: { body: unknown } }) => {
  const { uri } = parseRequestBody(interception.request.body) as { uri: string };
  // The app always writes the versionless v1 reference, whichever layout the post itself is in
  const match = /^pubky:\/\/([^/]+)\/pub\/social\/v1\/posts\/([^/]+)$/.exec(uri);
  expect(match, `tagged uri ${uri}`).to.not.equal(null);
  return { authorId: match![1], postId: match![2] };
};

// The version a homeserver post write stores. Its URL is `posts/{id}/{editId}.json`: a new post's edit id is its
// own id, and every edit adds a version with a higher one.
export const postVersionFromWriteUrl = (url: string) => {
  const match = /\/pub\/social\/v1\/posts\/([^/]+)\/([^/]+)\.json$/.exec(new URL(url).pathname);
  expect(match, `post write url ${url}`).to.not.equal(null);
  return { postId: match![1], editId: match![2] };
};

export const postIdFromWriteUrl = (url: string) => postVersionFromWriteUrl(url).postId;

const V1_POST_REFERENCE = /^pubky:\/\/[^/]+\/pub\/social\/v1\/posts\/[^/]+$/;
const V1_FILE_REFERENCE = /^pubky:\/\/[^/]+\/pub\/social\/v1\/files\/[^/]+$/;

type StoredPost = {
  kind: string;
  content: string;
  parent: string | null;
  embed: string | null;
  attachments: { uri: string }[];
};

/**
 * Checks what an intercepted post write carried, as a stored v1 post: a 0.x shape on a v1 path (a `short` kind,
 * string attachments, an `{uri, kind}` embed) fails to decode. The spec also reads a 0.x spelling of a reference,
 * but this app only ever writes the versionless v1 one, and an article or collection envelope names v1 objects.
 * Yields the post.
 */
export const expectV1PostWrite = (interception: { request: { body: unknown }; response?: { statusCode: number } }) => {
  expect(interception.response?.statusCode, 'post write status').to.eq(201);
  return cy
    .task<StoredPost>('decodeStoredPost', { body: JSON.stringify(parseRequestBody(interception.request.body)) })
    .then((post) => {
      [post.parent, post.embed].forEach((reference) => {
        if (reference !== null) expect(reference, 'post reference').to.match(V1_POST_REFERENCE);
      });
      post.attachments.forEach(({ uri }) => expect(uri, 'post attachment').to.match(V1_FILE_REFERENCE));
      if (post.kind === 'collection') {
        const { items } = JSON.parse(post.content) as { items: { uri: string }[] };
        items.forEach(({ uri }) => expect(uri, 'collection item').to.match(V1_POST_REFERENCE));
      }
      if (post.kind === 'article') {
        const { cover_image: cover } = JSON.parse(post.content) as { cover_image?: string | null };
        if (cover) expect(cover, 'article cover').to.match(V1_FILE_REFERENCE);
      }
      return post;
    });
};
