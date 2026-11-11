import type { NexusCheck, NexusExpectation, NexusNotificationType, NexusWaitArgs } from './types/nexus';
import type { SeededPost, SeededUser } from './types/seed';

// Nexus indexes homeserver writes asynchronously (watcher_sleep = 500ms in CI); poll at that pace.
const POLL_INTERVAL_MS = 500;
// Enough to see every notification a spec gives one receiver
const NOTIFICATIONS_LIMIT = 100;
// The most labels a spec puts on one post or profile (feed.cy.ts tags Profile 3's post five times)
const TAGS_LIMIT = 5;

type NexusAnswer = { status: number; body: unknown };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const arrayOf = (body: unknown): unknown[] => (Array.isArray(body) ? body : []);

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

// Every notification body names its actor in a `*_by` field (followed_by, tagged_by, replied_by, ...)
const isFrom = (notificationBody: Record<string, unknown>, actorId?: string) =>
  !actorId || Object.entries(notificationBody).some(([field, value]) => field.endsWith('_by') && value === actorId);

const isIndexed = (expectation: NexusExpectation, { status, body }: NexusAnswer): boolean => {
  if (status !== 200) return false;
  switch (expectation.kind) {
    case 'found':
      return true;
    case 'includes':
      return arrayOf(body).includes(expectation.value);
    case 'tags': {
      const indexed = arrayOf(body).map((tag) => recordOf(tag)['label']);
      return expectation.labels.every((label) => indexed.includes(label));
    }
    case 'notifications':
      return (
        arrayOf(body).filter((notification) => {
          const notificationBody = recordOf(recordOf(notification)['body']);
          return notificationBody['type'] === expectation.type && isFrom(notificationBody, expectation.actorId);
        }).length >= expectation.count
      );
    case 'bookmark':
      return Boolean(recordOf(body)['bookmark']);
    case 'lock':
      return Boolean(recordOf(body)['lock']);
    case 'streamKeys': {
      const keys = arrayOf(recordOf(body)['post_keys']).map(String);
      return expectation.postIds.every((postId) => keys.some((key) => key.endsWith(`:${postId}`)));
    }
  }
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

// The post's `lock` URL is the only thing that tells a reader it is locked; without it the app caches a
// normal post. Same endpoint and field as waitForNexusLockPost in cypress/support/locks.ts.
export const lockPostIndexed = (post: Pick<SeededPost, 'id' | 'authorId'>): NexusCheck => ({
  description: `lock on post ${post.id}`,
  path: `/v0/post/${post.authorId}/${post.id}/details`,
  expect: { kind: 'lock' },
});

export const followIndexed = (follower: SeededUser, followee: SeededUser): NexusCheck => ({
  description: `'${follower.name}' following '${followee.name}'`,
  path: `/v0/user/${followee.id}/followers`,
  expect: { kind: 'includes', value: follower.id },
});

// The post view only carries the viewer's bookmark when asked for that viewer
export const bookmarkIndexed = (user: SeededUser, post: SeededPost): NexusCheck => ({
  description: `'${user.name}' bookmarking post ${post.id}`,
  path: `/v0/post/${post.authorId}/${post.id}`,
  qs: { viewer_id: user.id },
  expect: { kind: 'bookmark' },
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

/**
 * Polls every check still pending together, once per round, until Nexus has indexed them all, then
 * resolves with each check's last response body (in `checks` order). Cypress calls this through
 * `cy.task` (`waitForNexus` in `cypress/support/nexus.ts`); Playwright calls it directly. A phase
 * of seeds therefore costs about one indexing delay, however many records its assertions read.
 */
export const createNexusTasks = (nexusUrl: string) => {
  const baseUrl = nexusUrl.replace(/\/$/, '');

  const fetchCheck = async ({ path, qs }: NexusCheck): Promise<NexusAnswer> => {
    const url = new URL(`${baseUrl}${path}`);
    Object.entries(qs ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
    try {
      const response = await fetch(url);
      const text = await response.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        // Not JSON (e.g. a 404 page): the status alone decides
      }
      return { status: response.status, body };
    } catch {
      return { status: 0, body: null };
    }
  };

  return {
    nexusWaitAll: async ({ checks, timeoutMs }: NexusWaitArgs): Promise<unknown[]> => {
      const startedAt = Date.now();
      const answers: (NexusAnswer | undefined)[] = checks.map(() => undefined);
      let pending = checks.map((_, index) => index);
      for (;;) {
        const round = await Promise.all(pending.map((index) => fetchCheck(checks[index])));
        round.forEach((answer, position) => {
          answers[pending[position]] = answer;
        });
        pending = pending.filter((index) => !isIndexed(checks[index].expect, answers[index] as NexusAnswer));
        if (pending.length === 0) {
          const descriptions = checks.map((check) => check.description).join('; ');
          console.log(`[nexus] indexed ${descriptions} (${Date.now() - startedAt}ms)`);
          return answers.map((answer) => answer?.body ?? null);
        }
        if (Date.now() - startedAt >= timeoutMs) {
          const missing = pending
            .map(
              (index) => `${checks[index].description} (GET ${checks[index].path} answered ${answers[index]?.status})`,
            )
            .join('; ');
          throw new Error(`Nexus did not index within ${timeoutMs / 1000}s: ${missing}`);
        }
        await sleep(POLL_INTERVAL_MS);
      }
    },
  };
};
