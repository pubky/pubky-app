import { COLLECTIONS_SECTION_PAGE_SIZE } from '../../src/config/collections';
import { DEFAULT_MAX_THREAD_REPLIES } from '../../src/hooks/useThreadReplies/useThreadReplies.constants';

// Nexus indexes homeserver writes asynchronously (watcher_sleep = 500ms in CI); poll at that pace.
const NEXUS_POLL_INTERVAL_MS = 500;
const NEXUS_POLL_ATTEMPTS = 120;

// `NEXUS_POSTS_PER_PAGE` and `NEXUS_STREAM_MAX_LIMIT` in src/config/nexus.ts, which the spec bundle
// cannot import (it pulls in the `@/` runtime config). Every page assertion checks the `limit` the
// app sends against `POSTS_PAGE_SIZE`, so a drift fails on the first request.
export const POSTS_PAGE_SIZE = 10;
const NEXUS_STREAM_MAX_LIMIT = 50;
export const COLLECTIONS_PAGE_SIZE = COLLECTIONS_SECTION_PAGE_SIZE;
export const THREAD_INITIAL_REPLIES = DEFAULT_MAX_THREAD_REPLIES;

export type StreamQuery = Record<string, string>;

export type RecordedStreamPage = {
  url: string;
  query: StreamQuery;
  keys: string[];
  score: number | null;
};

const toStreamQuery = (query: Record<string, string | number>): StreamQuery =>
  Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)]));

// Reads the post id from a homeserver post PUT URL (`.../pub/pubky.app/posts/<id>`)
export const postIdFromWriteUrl = (url: string): string => {
  const postId = new URL(url).pathname.split('/').pop();
  expect(postId, `post id in ${url}`).to.be.a('string').and.not.be.empty;
  return postId as string;
};

export const keyMatchesPostId = (key: string, postId: string) => key.endsWith(`:${postId}`);

/**
 * Polls `/v0/stream/posts/keys` with `query` until every id in `postIds` is indexed,
 * then yields the full stream as Nexus orders it: the ground truth a paginated surface
 * must reproduce page by page.
 */
export const waitForNexusStream = (query: StreamQuery, postIds: string[]): Cypress.Chainable<string[]> =>
  cy.env(['nexusUrl']).then(({ nexusUrl }) => {
    const url = `${String(nexusUrl).replace(/\/$/, '')}/v0/stream/posts/keys`;
    const qs = { ...query, limit: String(NEXUS_STREAM_MAX_LIMIT) };
    const poll = (attemptsLeft: number): Cypress.Chainable<string[]> =>
      cy.request({ url, qs, failOnStatusCode: false, log: false }).then((response) => {
        const keys: string[] =
          response.status === 200 && Array.isArray(response.body?.post_keys) ? response.body.post_keys : [];
        const missing = postIds.filter((postId) => !keys.some((key) => keyMatchesPostId(key, postId)));
        if (missing.length === 0) {
          expect(keys.length, 'seeded stream fits one Nexus page').to.be.lessThan(NEXUS_STREAM_MAX_LIMIT);
          return cy.wrap(keys, { log: false });
        }
        if (attemptsLeft <= 1) {
          throw new Error(
            `Nexus did not index ${missing.length} of ${postIds.length} posts for ${JSON.stringify(query)}`,
          );
        }
        cy.wait(NEXUS_POLL_INTERVAL_MS, { log: false });
        return poll(attemptsLeft - 1);
      });
    return poll(NEXUS_POLL_ATTEMPTS);
  });

// Polls a Nexus GET endpoint (e.g. `/v0/post/<author>/<id>`) until it answers 200
export const waitForNexusResource = (path: string) =>
  cy.env(['nexusUrl']).then(({ nexusUrl }) => {
    const url = `${String(nexusUrl).replace(/\/$/, '')}${path}`;
    const poll = (attemptsLeft: number) => {
      cy.request({ url, failOnStatusCode: false, log: false }).then((response) => {
        if (response.status === 200) return;
        if (attemptsLeft <= 1) {
          throw new Error(`Nexus did not index ${path}`);
        }
        cy.wait(NEXUS_POLL_INTERVAL_MS, { log: false });
        poll(attemptsLeft - 1);
      });
    };
    poll(NEXUS_POLL_ATTEMPTS);
  });

/**
 * Records every `/v0/stream/posts/keys` response the app receives whose query passes `matches`,
 * in arrival order. Register before the page loads so the first page is captured.
 */
export const recordStreamPages = (matches: (query: StreamQuery) => boolean): RecordedStreamPage[] => {
  const pages: RecordedStreamPage[] = [];
  cy.intercept({ method: 'GET', url: '**/v0/stream/posts/keys*' }, (req) => {
    const query = toStreamQuery(req.query);
    if (!matches(query)) return;
    req.on('response', (res) => {
      pages.push({
        url: req.url,
        query,
        keys: Array.isArray(res.body?.post_keys) ? res.body.post_keys : [],
        score: typeof res.body?.last_post_score === 'number' ? res.body.last_post_score : null,
      });
    });
  });
  return pages;
};

// A head poll (`end` without `start`) asks for posts newer than the feed head, not the next page
export const isPagingRequest = (query: StreamQuery) => query['end'] === undefined || query['start'] !== undefined;

// Where the app resumes a score-paginated stream from the previous page's `last_post_score`
type PageCursor = { param: 'start' | 'end'; offset: number };

const assertPagesReadToEnd = (
  pages: RecordedStreamPage[],
  expectedKeys: string[],
  pageSize: number,
  cursor: PageCursor,
) => {
  const expectedRequests = Math.floor(expectedKeys.length / pageSize) + 1;
  expect(expectedRequests, 'seeded stream spans more than one page').to.be.greaterThan(1);
  cy.wrap(pages, { log: false }).should((recorded: RecordedStreamPage[]) => {
    expect(recorded, 'stream page requests').to.have.length(expectedRequests);
    expect(recorded[0].query[cursor.param], 'first page has no cursor').to.equal(undefined);
    recorded.forEach((page, index) => {
      expect(page.query['limit'], `page ${index + 1} limit`).to.equal(String(pageSize));
      const isLast = index === recorded.length - 1;
      if (isLast) {
        expect(page.keys.length, 'last page is short').to.be.lessThan(pageSize);
      } else {
        expect(page.keys, `page ${index + 1} is full`).to.have.length(pageSize);
      }
      if (index > 0) {
        const previousScore = recorded[index - 1].score;
        expect(previousScore, `page ${index} cursor`).to.be.a('number');
        expect(page.query[cursor.param], `page ${index + 1} resumes from the Nexus cursor`).to.equal(
          String((previousScore as number) + cursor.offset),
        );
      }
    });
    const keys = recorded.flatMap((page) => page.keys);
    expect(new Set(keys).size, 'no duplicate post across pages').to.equal(keys.length);
    expect(keys, 'pages reproduce the Nexus stream').to.deep.equal(expectedKeys);
  });
};

/**
 * Asserts a newest-first stream was read page by page down to its end: a full first page,
 * each later page resumed from the previous page's Nexus cursor (`start = score - 1`, #2552),
 * and exactly one short page that stopped loading (#2290, #2170). Together the pages reproduce
 * `expectedKeys` in order, so no post is duplicated or skipped.
 */
export const assertScorePagesReadToEnd = (
  pages: RecordedStreamPage[],
  expectedKeys: string[],
  pageSize = POSTS_PAGE_SIZE,
) => assertPagesReadToEnd(pages, expectedKeys, pageSize, { param: 'start', offset: -1 });

/**
 * The oldest-first variant, as a reply thread expands: each later page asks for posts newer than
 * the previous page (`end = score + 1`), and one short page ends the thread.
 */
export const assertAscendingPagesReadToEnd = (
  pages: RecordedStreamPage[],
  expectedKeys: string[],
  pageSize = POSTS_PAGE_SIZE,
) => assertPagesReadToEnd(pages, expectedKeys, pageSize, { param: 'end', offset: 1 });

// No request URL is fetched twice: a pagination loop re-requests the same cursor
export const assertNoRepeatedStreamRequests = (pages: RecordedStreamPage[], maxRequests: number) => {
  cy.wrap(pages, { log: false }).should((recorded: RecordedStreamPage[]) => {
    const urls = recorded.map((page) => page.url);
    expect(new Set(urls).size, 'distinct stream requests').to.equal(urls.length);
    expect(urls.length, 'stream requests').to.be.at.most(maxRequests);
  });
};

/**
 * Scrolls a `TimelinePosts` list (`[data-cy="timeline-posts"]`) to its end, one page at a time,
 * then asserts it settled: every post rendered once, the end message shown, and no sentinel or
 * loading skeleton left behind to keep requesting.
 */
export const scrollTimelineToEnd = (timeline: string, expectedCount: number, pageSize = POSTS_PAGE_SIZE) => {
  const cards = `${timeline} > [data-cy="post-card"]`;
  cy.get(cards).should('have.length.at.least', Math.min(pageSize, expectedCount));
  for (let loaded = pageSize; loaded < expectedCount; loaded += pageSize) {
    cy.get(cards).should('have.length.at.least', loaded).last().scrollIntoView();
  }
  cy.get(cards).should('have.length', expectedCount).last().scrollIntoView();
  cy.get(`${timeline} [data-cy="timeline-end-message"]`).should('be.visible');
  cy.get(`${timeline} [data-cy="timeline-sentinel"]`).should('not.exist');
  cy.get(`${timeline} [data-cy="timeline-loading-more"]`).should('not.exist');
  cy.get(`${timeline} [data-cy="timeline-load-more"]`).should('not.exist');
  cy.get(cards).should('have.length', expectedCount);
};

// The seeded texts (those starting with `prefix`) render once each, in `expected` order
export const assertSeededTextsInOrder = (timeline: string, prefix: string, expected: string[]) => {
  cy.get(`${timeline} > [data-cy="post-card"]`).should(($cards) => {
    const texts = $cards
      .toArray()
      .map((card) => (Cypress.$(card).find('[data-cy="post-text"]').first().text() ?? '').trim())
      .filter((text) => text.startsWith(prefix));
    expect(texts, 'seeded posts in stream order').to.deep.equal(expected);
  });
};
