import type { NexusCheck, NexusNotificationType } from './types/nexus';
import type { SeededPost, SeededUser } from './types/seed';

const NEXUS_WAIT_TIMEOUT_MS = 60_000;
// Enough to see every notification a spec gives one receiver
const NOTIFICATIONS_LIMIT = 100;
// The most labels a spec puts on one post or profile (feed.cy.ts tags Profile 3's post five times)
const TAGS_LIMIT = 5;

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
  path: `/v0/user/${user.id}`,
  expect: { kind: 'found' },
});

// The search the @mention popover and header search run, which Nexus fills separately from the user record
export const userSearchIndexed = (user: SeededUser): NexusCheck => ({
  description: `user '${user.name}' in name search`,
  path: `/v0/search/users/by_name/${encodeURIComponent(user.name)}`,
  expect: { kind: 'includes', value: user.id },
});

export const postIndexed = (post: Pick<SeededPost, 'id' | 'authorId'>): NexusCheck => ({
  description: `post ${post.id}`,
  path: `/v0/post/${post.authorId}/${post.id}`,
  expect: { kind: 'found' },
});

export const followIndexed = (follower: SeededUser, followee: SeededUser): NexusCheck => ({
  description: `'${follower.name}' following '${followee.name}'`,
  path: `/v0/user/${followee.id}/followers`,
  expect: { kind: 'includes', value: follower.id },
});

export const postTagsIndexed = (post: Pick<SeededPost, 'id' | 'authorId'>, labels: string[]): NexusCheck => ({
  description: `tags ${labels.join(', ')} on post ${post.id}`,
  path: `/v0/post/${post.authorId}/${post.id}/tags`,
  qs: { limit_tags: String(TAGS_LIMIT) },
  expect: { kind: 'tags', labels },
});

export const userTagsIndexed = (user: SeededUser, labels: string[]): NexusCheck => ({
  description: `tags ${labels.join(', ')} on user '${user.name}'`,
  path: `/v0/user/${user.id}/tags`,
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
  path: `/v0/user/${receiver.id}/notifications`,
  qs: { limit: String(NOTIFICATIONS_LIMIT) },
  expect: { kind: 'notifications', type, actorId: actor?.id, count },
});

// Every id in `postIds` listed by the `/v0/stream/posts/keys` stream `query` (first `limit` keys)
export const streamIndexed = (query: Record<string, string>, postIds: string[], limit: number): NexusCheck => ({
  description: `${postIds.length} posts in stream ${JSON.stringify(query)}`,
  path: '/v0/stream/posts/keys',
  qs: { ...query, limit: String(limit) },
  expect: { kind: 'streamKeys', postIds },
});

// Homeserver write bodies reach the intercept as a string, raw bytes or parsed JSON depending on the browser.
const parseRequestBody = (body: unknown): unknown => {
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

// The post a homeserver post write belongs to. Its URL names one version, `posts/{id}/{editId}.json`.
export const postIdFromWriteUrl = (url: string) => {
  const match = /\/pub\/social\/v1\/posts\/([^/]+)\/[^/]+\.json$/.exec(new URL(url).pathname);
  expect(match, `post write url ${url}`).to.not.equal(null);
  return match![1];
};
