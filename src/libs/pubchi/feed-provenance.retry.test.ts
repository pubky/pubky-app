import type { Session } from '@synonymdev/pubky';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthErrorCode } from '@/libs/error/error.codes';
import type { FeedProposalV1 } from '@/libs/pubchi/schemas/feed';
import type { PubchiFeedProvenanceV1 } from '@/libs/pubchi/schemas/feed-provenance';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { HomeserverService } from '@/services/homeserver/homeserver';
import {
  HOMESERVER_PUBLISH_CONFLICT_MESSAGE,
  installHomeserverWriteRetryDependenciesForTests,
} from '@/services/homeserver/write-retry';
import { useAuthStore } from '@/stores/auth/auth.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { recordPubchiBuiltFeed } from './feed-provenance';

const OWNER = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const FEED: FeedModelSchema = {
  id: 'feed-1',
  name: 'Builders',
  tags: ['builders'],
  domain_tags: [],
  reach: PubkyAppFeedReach.Following,
  sort: PubkyAppFeedSort.Recent,
  content: null,
  layout: PubkyAppFeedLayout.Columns,
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_000_000,
};
const PROPOSAL: FeedProposalV1 = {
  schema: 'pubchi-feed-proposal',
  version: 1,
  bot: OWNER,
  owner: OWNER,
  generated_at: 1_700_000_000,
  feed: {
    name: 'Builders',
    created_at: 1_700_000_000,
    feed: { tags: ['builders'], reach: 'following', layout: 'columns', sort: 'recent' },
  },
  warnings: [],
  installed_user_feed_id: null,
};
type RemoteRecord = PubchiFeedProvenanceV1 & { extension: { note: string } };

function requestError(statusCode: number): Error {
  const body = statusCode === 409 ? HOMESERVER_PUBLISH_CONFLICT_MESSAGE : 'Service unavailable';
  return Object.assign(new Error(`Request failed: Server responded with an error: ${statusCode} - ${body}`), {
    name: 'RequestError',
    data: { statusCode },
  });
}

describe('Pubchi feed provenance with real homeserver retries', () => {
  let remote: RemoteRecord;
  const putJson = vi.fn<(path: string, body: RemoteRecord) => Promise<void>>();
  const read = vi.fn<() => Promise<string>>();
  const sleep = vi.fn<() => Promise<void>>();
  const session = () => asOpaque<Session>({ info: { publicKey: { z32: () => OWNER } }, storage: { putJson } });

  beforeEach(() => {
    remote = {
      schema: 'pubchi-feed-provenance',
      version: 1,
      feed_id: FEED.id,
      created_at: 1_700_000_000,
      proposal_hash: 'a'.repeat(64),
      bot: OWNER,
      extension: { note: 'old' },
    };
    read.mockReset().mockImplementation(async () => JSON.stringify(remote));
    vi.spyOn(HomeserverService, 'requestRawText').mockImplementation(read);
    putJson.mockReset().mockImplementation(async (_path, body) => {
      remote = structuredClone(body);
    });
    sleep.mockReset().mockResolvedValue();
    installHomeserverWriteRetryDependenciesForTests({ sleep, random: () => 0, now: () => 0 });
    useAuthStore.setState({
      session: session(),
      currentUserPubky: OWNER,
      generation: 'generation-1',
      restoreStatus: 'ready',
      sessionReference: null,
      isLoggingOut: false,
    });
  });

  afterEach(() => {
    installHomeserverWriteRetryDependenciesForTests(null);
    useAuthStore.setState({ session: null, currentUserPubky: null, generation: '', isLoggingOut: false });
    vi.restoreAllMocks();
  });

  it.each([429, 500, 503, 409])('rereads and retains concurrent changes after a %i write failure', async (status) => {
    putJson.mockRejectedValueOnce(requestError(status));
    sleep.mockImplementationOnce(async () => {
      remote = { ...remote, created_at: 1_700_000_001, extension: { note: 'other-client-update' } };
    });

    await expect(recordPubchiBuiltFeed(OWNER, PROPOSAL, FEED)).resolves.toBe(true);

    expect(read).toHaveBeenCalledTimes(2);
    expect(putJson).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
    expect(remote).toMatchObject({
      created_at: 1_700_000_001,
      extension: { note: 'other-client-update' },
      proposal_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(remote.proposal_hash).not.toBe('a'.repeat(64));
  });

  it('refuses malformed provenance discovered on a retry', async () => {
    putJson.mockRejectedValueOnce(requestError(503));
    sleep.mockImplementationOnce(async () => {
      read.mockResolvedValue('malformed json');
    });

    await expect(recordPubchiBuiltFeed(OWNER, PROPOSAL, FEED)).resolves.toBe(false);

    expect(read).toHaveBeenCalledTimes(2);
    expect(putJson).toHaveBeenCalledOnce();
  });

  it.each([
    ['logout begins', () => useAuthStore.setState({ isLoggingOut: true })],
    ['the account generation changes', () => useAuthStore.setState({ generation: 'generation-2' })],
    ['the session changes', () => useAuthStore.setState({ session: session() })],
  ])('does not reread or retry after %s during backoff', async (_name, change) => {
    putJson.mockRejectedValueOnce(requestError(503));
    sleep.mockImplementationOnce(async () => {
      change();
    });

    await expect(recordPubchiBuiltFeed(OWNER, PROPOSAL, FEED)).rejects.toMatchObject({
      code: AuthErrorCode.SESSION_EXPIRED,
    });

    expect(read).toHaveBeenCalledOnce();
    expect(putJson).toHaveBeenCalledOnce();
  });

  it.each([1, 2])('does not write after the session changes during read %i', async (changedRead) => {
    if (changedRead === 2) putJson.mockRejectedValueOnce(requestError(503));
    read.mockImplementation(async () => {
      if (read.mock.calls.length === changedRead) useAuthStore.setState({ generation: 'generation-2' });
      return JSON.stringify(remote);
    });

    await expect(recordPubchiBuiltFeed(OWNER, PROPOSAL, FEED)).rejects.toMatchObject({
      code: AuthErrorCode.SESSION_EXPIRED,
    });

    expect(read).toHaveBeenCalledTimes(changedRead);
    expect(putJson).toHaveBeenCalledTimes(changedRead - 1);
  });
});
