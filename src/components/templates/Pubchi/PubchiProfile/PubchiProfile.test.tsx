import { render, screen, waitFor } from '@testing-library/react';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiProfile } from './PubchiProfile';

const mocks = vi.hoisted(() => ({
  getList: vi.fn(),
  listPubchiFeedProvenance: vi.fn(),
  owner: 'owner-pubky',
  onSync: undefined as ((message: { owner: string; kind: string }) => void) | undefined,
}));

vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => ({
    pubchi: { bot: 'bot', displayName: 'Pubchi', createdAt: 1, verified: true },
    config: { tier: 'assisted', brain: { execution: 'synonym-hosted' } },
    context: {
      schema: 'pubchi-owner-context',
      version: 1,
      about: 'Bitcoin developer in Lisbon',
      instructions: 'Two sentences max',
      updated_at: 1,
    },
    devices: [],
    needsReapproval: false,
  }),
}));

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: { getList: (...args: unknown[]) => mocks.getList(...args) },
}));

vi.mock('@/controllers/pubchi/pubchi-sync', () => ({
  subscribeToPubchiSync: (onMessage: (message: { owner: string; kind: string }) => void) => {
    mocks.onSync = onMessage;
    return () => {
      mocks.onSync = undefined;
    };
  },
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    fetchBuiltFeedProvenance: (...args: unknown[]) => mocks.listPubchiFeedProvenance(...args),
    openFlyout: vi.fn(),
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: mocks.owner }),
}));

describe('PubchiProfile', () => {
  beforeEach(() => {
    mocks.getList.mockReset();
    mocks.listPubchiFeedProvenance.mockReset();
    mocks.onSync = undefined;
    mocks.getList.mockResolvedValue([
      {
        id: 'pubchi-feed',
        name: 'Builders',
        tags: ['builders'],
        domain_tags: [],
        reach: PubkyAppFeedReach.Following,
        sort: PubkyAppFeedSort.Recent,
        content: null,
        layout: PubkyAppFeedLayout.Columns,
        created_at: 1_768_454_400_000,
        updated_at: 1_768_454_400_000,
      },
      {
        id: 'user-feed',
        name: 'Builders',
        tags: ['user'],
        domain_tags: [],
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: null,
        layout: PubkyAppFeedLayout.Columns,
        created_at: 1_768_454_400_000,
        updated_at: 1_768_454_400_000,
      },
    ]);
    mocks.listPubchiFeedProvenance.mockResolvedValue([
      {
        schema: 'pubchi-feed-provenance',
        version: 1,
        feed_id: 'pubchi-feed',
        created_at: 1_768_454_400,
        proposal_hash: 'a'.repeat(64),
        bot: 'b'.repeat(52),
      },
    ]);
  });

  it('lists a Pubchi-applied feed and excludes a same-named user feed', async () => {
    render(<PubchiProfile />);

    await waitFor(() => expect(screen.getByTestId('pubchi-built-feeds')).toHaveTextContent('Builders'));
    expect(screen.getByTestId('pubchi-brain-card')).toHaveTextContent('Bitcoin developer in Lisbon');
    expect(screen.getByRole('link', { name: /edit brain/i })).toHaveAttribute('href', '/pubchi/brain');
    expect(screen.getByTestId('pubchi-built-feeds')).toHaveTextContent('builders');
    expect(screen.queryByText('user')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open/i })).toHaveAttribute('href', '/feed/pubchi-feed');
    expect(mocks.listPubchiFeedProvenance).toHaveBeenCalledWith();
    expect(mocks.getList).toHaveBeenCalledTimes(1);
    expect(mocks.listPubchiFeedProvenance).toHaveBeenCalledTimes(1);
  });

  it('reloads the listing for a created message from the current owner', async () => {
    render(<PubchiProfile />);

    await waitFor(() => expect(mocks.getList).toHaveBeenCalledTimes(1));
    mocks.onSync?.({ owner: mocks.owner, kind: 'created' });

    await waitFor(() => expect(mocks.getList).toHaveBeenCalledTimes(2));
    expect(mocks.listPubchiFeedProvenance).toHaveBeenCalledTimes(2);
  });

  it('does not reload the listing for a foreign owner message', async () => {
    render(<PubchiProfile />);

    await waitFor(() => expect(mocks.getList).toHaveBeenCalledTimes(1));
    mocks.onSync?.({ owner: 'foreign-owner', kind: 'created' });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.getList).toHaveBeenCalledTimes(1);
  });
});
