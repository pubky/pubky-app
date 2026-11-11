import type { NexusCheck } from './types/nexus';

export {
  bookmarkIndexed,
  followIndexed,
  lockPostIndexed,
  notificationsIndexed,
  postIndexed,
  postTagsIndexed,
  streamIndexed,
  userIndexed,
  userSearchIndexed,
  userTagsIndexed,
} from '../../e2e/shared/nexus';

const NEXUS_WAIT_TIMEOUT_MS = 60_000;

/**
 * Waits until Nexus has indexed every record in `checks`, polling them together (e2e/shared/nexus.ts),
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
  const match = /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/posts\/([^/]+)$/.exec(uri);
  expect(match, `tagged uri ${uri}`).to.not.equal(null);
  return { authorId: match![1], postId: match![2] };
};
