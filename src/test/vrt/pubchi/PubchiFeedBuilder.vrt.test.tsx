import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import { describe, expect, it, vi } from 'vitest';
import type { FeedProposalV2 } from '@/libs/pubchi/schemas/feed';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { PubchiFeedBuilder } from '@/organisms/Pubchi/PubchiFeedBuilder/PubchiFeedBuilder';
import { matchVrtElementScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const BOT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const proposal = (
  reach: FeedProposalV2['feed']['feed']['reach'],
  unmapped: FeedProposalV2['mapping']['unmapped'] = [],
): FeedProposalV2 => ({
  schema: 'pubchi-feed-proposal',
  version: 2,
  bot: BOT,
  owner: BOT,
  generated_at: 1,
  mode: 'create',
  target_feed_id: null,
  feed: {
    name: 'Bitcoin builders',
    icon: 'rss',
    feed: {
      tags: ['bitcoin'],
      domain_tags: ['builders'],
      reach,
      layout: 'columns',
      sort: 'recent',
      content: 'short',
    },
  },
  mapping: { status: unmapped.length > 0 ? 'adjusted' : 'exact', unmapped },
  warnings: [],
  installed_user_feed_id: null,
});

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ waitForAuth: async () => true }),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: BOT }),
}));

vi.mock('@/controllers/stream/posts/posts', () => ({
  StreamPostsController: { getLocalStream: vi.fn().mockResolvedValue({ stream: ['post-a', 'post-b'] }) },
}));

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: { commitCreate: vi.fn(), commitUpdate: vi.fn() },
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: { commitRecordBuiltFeed: vi.fn() },
}));

const existingFeed: FeedModelSchema = {
  id: 'feed-existing',
  name: 'Bitcoin builders',
  icon: 'rss',
  tags: ['bitcoin'],
  domain_tags: ['builders'],
  reach: PubkyAppFeedReach.Following,
  sort: PubkyAppFeedSort.Recent,
  layout: PubkyAppFeedLayout.Columns,
  content: PubkyAppPostKind.Short,
  created_at: 1,
  updated_at: 1,
};

describe('PubchiFeedBuilder — visual regression', () => {
  it('guards and captures a pre-filled production builder', async () => {
    const screen = await renderForVRT(
      <PubchiFeedBuilder
        proposal={proposal('following')}
        open
        onOpenChange={() => undefined}
        onInterpret={async () => undefined}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    const surface = screen.getByTestId('pubchi-feed-builder');
    await expect.element(surface).toHaveAttribute('data-surface', 'pubchi-feed-builder');
    await expect.element(surface).toBeVisible();
    await expect.element(screen.getByTestId('feed-name-input')).toHaveValue('Bitcoin builders');
    const createDescription = screen.getByTestId('pubchi-feed-interpret-input');
    await expect
      .element(screen.getByText('Feed description', { exact: true }))
      .toHaveAttribute('for', 'pubchi-feed-interpret-input');
    await expect.element(createDescription).toHaveAttribute('id', 'pubchi-feed-interpret-input');
    await expect
      .element(screen.getByRole('textbox', { name: 'Feed description', exact: true }))
      .toHaveAttribute('placeholder', 'Describe the feed you want to create…');
    await matchVrtElementScreenshot(surface, 'pubchi-feed-builder-prefilled');
  });

  it('uses change-oriented copy for an existing feed', async () => {
    const screen = await renderForVRT(
      <PubchiFeedBuilder
        proposal={{ ...proposal('following'), mode: 'update', target_feed_id: existingFeed.id }}
        existingFeed={existingFeed}
        open
        onOpenChange={() => undefined}
        onInterpret={async () => undefined}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    const surface = screen.getByTestId('pubchi-feed-builder');
    await expect.element(surface).toHaveAttribute('data-surface', 'pubchi-feed-builder');
    const updateDescription = screen.getByTestId('pubchi-feed-interpret-input');
    await expect
      .element(screen.getByText('Changes to make', { exact: true }))
      .toHaveAttribute('for', 'pubchi-feed-interpret-input');
    await expect.element(updateDescription).toHaveAttribute('id', 'pubchi-feed-interpret-input');
    await expect
      .element(screen.getByRole('textbox', { name: 'Changes to make', exact: true }))
      .toHaveAttribute('placeholder', 'Describe what to change…');
  });

  it('captures the blocked followers proposal with unmapped likes notice', async () => {
    const screen = await renderForVRT(
      <PubchiFeedBuilder
        proposal={proposal('followers', [
          {
            request: 'likes',
            reason: 'likes_unavailable',
            suggestion: "Feeds can't filter by likes because Pubky doesn't model likes; closest: Popularity or Recent",
          },
        ])}
        open
        onOpenChange={() => undefined}
        onInterpret={async () => undefined}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    const surface = screen.getByTestId('pubchi-feed-builder');
    await expect.element(surface).toHaveAttribute('data-surface', 'pubchi-feed-builder');
    await expect.element(surface).toBeVisible();
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Followers was requested but is not available in this App — choose another reach.');
    await expect.element(screen.getByTestId('save-feed-button')).toBeDisabled();
    await matchVrtElementScreenshot(surface, 'pubchi-feed-builder-blocked');
  });
});
