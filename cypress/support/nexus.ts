import type { SeededPost, SeededUser } from './types/seed';

// Nexus indexes homeserver writes asynchronously (watcher_sleep = 500ms in CI); poll at that pace.
const NEXUS_POLL_INTERVAL_MS = 500;
const NEXUS_POLL_ATTEMPTS = 120;
// Enough to see every notification a spec gives one receiver
const NOTIFICATIONS_LIMIT = 100;

type NexusResponse = Cypress.Response<unknown>;

export type NexusNotificationType =
  | 'follow'
  | 'new_friend'
  | 'tag_post'
  | 'tag_profile'
  | 'reply'
  | 'repost'
  | 'mention'
  | 'post_deleted'
  | 'post_edited';

type NexusNotification = { timestamp: number; body: { type: string } & Record<string, unknown> };

const arrayBody = <T>(response: NexusResponse): T[] =>
  response.status === 200 && Array.isArray(response.body) ? (response.body as T[]) : [];

/**
 * Polls a Nexus GET `path` (with `qs`) until `isIndexed` accepts the response, then yields it.
 * Fails naming `description`, so a seed that never indexes says which write it was waiting for.
 */
export const waitForNexus = (
  description: string,
  path: string,
  isIndexed: (response: NexusResponse) => boolean,
  qs?: Record<string, string>,
): Cypress.Chainable<NexusResponse> =>
  cy.env(['nexusUrl']).then(({ nexusUrl }) => {
    const url = `${String(nexusUrl).replace(/\/$/, '')}${path}`;
    const poll = (attemptsLeft: number): Cypress.Chainable<NexusResponse> =>
      cy.request({ url, qs, failOnStatusCode: false, log: false }).then((response) => {
        if (isIndexed(response)) return cy.wrap(response, { log: false });
        if (attemptsLeft <= 1) {
          throw new Error(
            `Nexus did not index ${description} within ${(NEXUS_POLL_ATTEMPTS * NEXUS_POLL_INTERVAL_MS) / 1000}s (GET ${path} answered ${response.status})`,
          );
        }
        cy.wait(NEXUS_POLL_INTERVAL_MS, { log: false });
        return poll(attemptsLeft - 1);
      });
    cy.log(`Waiting for Nexus to index ${description}`);
    return poll(NEXUS_POLL_ATTEMPTS);
  });

export const waitForNexusUser = (user: SeededUser) =>
  waitForNexus(`user '${user.name}'`, `/v0/user/${user.id}`, (response) => response.status === 200);

// The search the @mention popover and header search run, which Nexus fills separately from the user record
export const waitForNexusUserSearch = (user: SeededUser) =>
  waitForNexus(`user '${user.name}' in name search`, `/v0/search/users/by_name/${encodeURIComponent(user.name)}`, (r) =>
    arrayBody<string>(r).includes(user.id),
  );

export const waitForNexusPost = (post: SeededPost) =>
  waitForNexus(`post ${post.id}`, `/v0/post/${post.authorId}/${post.id}`, (response) => response.status === 200);

export const waitForNexusFollow = (follower: SeededUser, followee: SeededUser) =>
  waitForNexus(`'${follower.name}' following '${followee.name}'`, `/v0/user/${followee.id}/followers`, (response) =>
    arrayBody<string>(response).includes(follower.id),
  );

// The post view only carries the viewer's bookmark when asked for that viewer
export const waitForNexusBookmark = (user: SeededUser, post: SeededPost) =>
  waitForNexus(
    `'${user.name}' bookmarking post ${post.id}`,
    `/v0/post/${post.authorId}/${post.id}`,
    (response) => response.status === 200 && Boolean((response.body as { bookmark?: unknown } | null)?.bookmark),
    { viewer_id: user.id },
  );

const hasTagLabels = (response: NexusResponse, labels: string[]) => {
  const indexed = arrayBody<{ label: string }>(response).map((tag) => tag.label);
  return labels.every((label) => indexed.includes(label));
};

export const waitForNexusPostTags = (post: SeededPost, labels: string[]) =>
  waitForNexus(`tags ${labels.join(', ')} on post ${post.id}`, `/v0/post/${post.authorId}/${post.id}/tags`, (r) =>
    hasTagLabels(r, labels),
  );

export const waitForNexusUserTags = (user: SeededUser, labels: string[]) =>
  waitForNexus(`tags ${labels.join(', ')} on user '${user.name}'`, `/v0/user/${user.id}/tags`, (r) =>
    hasTagLabels(r, labels),
  );

// Every notification body names its actor in a `*_by` field (followed_by, tagged_by, replied_by, ...)
const isFrom = (notification: NexusNotification, actor?: SeededUser) =>
  !actor || Object.entries(notification.body).some(([field, value]) => field.endsWith('_by') && value === actor.id);

/**
 * Waits until Nexus holds `count` notifications of `type` for `receiver` (from `actor`, when given),
 * so the receiver's first sign-in already finds them instead of racing the indexer.
 */
export const waitForNexusNotifications = (
  receiver: SeededUser,
  type: NexusNotificationType,
  { actor, count = 1 }: { actor?: SeededUser; count?: number } = {},
) =>
  waitForNexus(
    `${count} ${type} notification(s) for '${receiver.name}'${actor ? ` from '${actor.name}'` : ''}`,
    `/v0/user/${receiver.id}/notifications`,
    (response) =>
      arrayBody<NexusNotification>(response).filter(
        (notification) => notification.body.type === type && isFrom(notification, actor),
      ).length >= count,
    { limit: String(NOTIFICATIONS_LIMIT) },
  );
