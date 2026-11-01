import type { NexusCheck, NexusExpectation, NexusWaitArgs } from '../support/types/nexus';

// Nexus indexes homeserver writes asynchronously (watcher_sleep = 500ms in CI); poll at that pace.
const POLL_INTERVAL_MS = 500;

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
    case 'streamKeys': {
      const keys = arrayOf(recordOf(body)['post_keys']).map(String);
      return expectation.postIds.every((postId) => keys.some((key) => key.endsWith(`:${postId}`)));
    }
  }
};

/**
 * Node side of `waitForNexus` in `cypress/support/nexus.ts`: polls every check still pending
 * together, once per round, until Nexus has indexed them all, then resolves with each check's
 * last response body (in `checks` order). A phase of seeds therefore costs about one indexing
 * delay, however many records its assertions read.
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
