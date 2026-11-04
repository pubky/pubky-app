import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import { describe, expect, it, vi } from 'vitest';
import { PubchiProfile } from '@/templates/Pubchi/PubchiProfile/PubchiProfile';
import { matchVrtElementScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

const BOT = vi.hoisted(() => '9o6xw6h5r4n3m2k1j0hgfedcba987654321zyxwvutsrqpox444y');

vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => ({
    pubchi: {
      bot: BOT,
      displayName: 'Research Pubchi',
      createdAt: 1_768_454_400,
      backupConfirmedAt: 1_768_454_400,
      verified: true,
    },
    config: {
      tier: 'assisted',
      brain: {
        execution: 'synonym-hosted',
        provider_id: 'moonshot',
        model_id: 'kimi-k3',
        endpoint: null,
        adapter: 'vercel-ai',
        send_public_graph_context: true,
        send_public_web_context: true,
      },
    },
    devices: [],
    needsReapproval: false,
  }),
}));

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: {
    getList: async () => [
      {
        id: 'vrt-pubchi-feed',
        name: 'Builders',
        icon: 'sparkles',
        tags: ['builders', 'rust'],
        domain_tags: [],
        reach: PubkyAppFeedReach.Following,
        sort: PubkyAppFeedSort.Recent,
        content: null,
        layout: PubkyAppFeedLayout.Columns,
        created_at: 1_768_454_400_000,
        updated_at: 1_768_454_400_000,
      },
      {
        id: 'vrt-user-feed',
        name: 'My Feed',
        icon: 'sparkles',
        tags: ['bitcoin'],
        domain_tags: [],
        reach: PubkyAppFeedReach.Following,
        sort: PubkyAppFeedSort.Recent,
        content: null,
        layout: PubkyAppFeedLayout.Columns,
        created_at: 1_768_454_400_000,
        updated_at: 1_768_454_400_000,
      },
    ],
  },
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    openFlyout: vi.fn(),
    fetchBuiltFeedProvenance: async () => [
      {
        schema: 'pubchi-feed-provenance',
        version: 1,
        feed_id: 'vrt-pubchi-feed',
        created_at: 1_768_454_400,
        proposal_hash: 'a'.repeat(64),
        bot: BOT,
      },
    ],
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: BOT }),
}));

describe('PubchiProfile — visual regression', () => {
  it('guards the production page surface marker', async () => {
    const screen = await renderForVRT(<PubchiProfile />, { viewport: VRT_VIEWPORT_DESKTOP });
    const surface = screen.getByTestId('pubchi-profile-page');
    await expect.element(surface).toHaveAttribute('data-surface', 'pubchi-profile-page');
  });

  it('captures the production Pubchi page surface only', async () => {
    const screen = await renderForVRT(<PubchiProfile />, { viewport: VRT_VIEWPORT_DESKTOP });
    await matchVrtElementScreenshot(screen.getByTestId('pubchi-profile-page'), 'pubchi-profile-page-desktop');
  });
});
