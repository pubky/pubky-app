import { fireEvent, render, screen } from '@testing-library/react';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedController } from '@/controllers/feed/feed';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { publishPubchiSync } from '@/controllers/pubchi/pubchi-sync';
import type { FeedProposalV2 } from '@/libs/pubchi/schemas/feed';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { PubchiFeedBuilder } from './PubchiFeedBuilder';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const authState = vi.hoisted(() => ({ capabilities: [] as string[] }));

const proposal: FeedProposalV2 = {
  schema: 'pubchi-feed-proposal',
  version: 2,
  bot: OWNER,
  owner: OWNER,
  generated_at: 1,
  mode: 'create',
  target_feed_id: null,
  feed: {
    name: 'Builders',
    icon: 'rss',
    feed: { reach: 'following', sort: 'recent', layout: 'columns' },
  },
  mapping: { status: 'exact', unmapped: [] },
  warnings: [],
  installed_user_feed_id: null,
};

const feed: FeedModelSchema = {
  id: 'feed-1',
  name: 'Builders',
  tags: [],
  domain_tags: [],
  reach: PubkyAppFeedReach.Following,
  sort: PubkyAppFeedSort.Recent,
  content: null,
  layout: PubkyAppFeedLayout.Columns,
  created_at: 1,
  updated_at: 1,
};

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: {
    commitCreate: vi.fn(),
    commitUpdate: vi.fn(),
  },
}));

vi.mock('@/controllers/pubchi/pubchi-sync', () => ({ publishPubchiSync: vi.fn() }));
vi.mock('@/controllers/pubchi/pubchi', () => ({ PubchiController: { commitRecordBuiltFeed: vi.fn() } }));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));
vi.mock('@/controllers/stream/posts/posts', () => ({
  StreamPostsController: { getLocalStream: vi.fn().mockResolvedValue({ stream: [] }) },
}));
vi.mock('@/atoms/Button/Button', () => ({
  Button: ({ children, ...props }: { children: React.ReactNode }) => <button {...props}>{children}</button>,
}));
vi.mock('@/atoms/Typography/Typography', () => ({
  Typography: ({ children, ...props }: { children: React.ReactNode }) => <div {...props}>{children}</div>,
}));
vi.mock('@/organisms/CustomFeedDialog/CustomFeedDialog', () => ({
  CustomFeedDialog: ({
    onSubmitOverride,
    extraContent,
  }: {
    onSubmitOverride: (data: Record<string, unknown>) => Promise<boolean>;
    extraContent: React.ReactNode;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => void onSubmitOverride({ name: 'Builders', icon: 'rss', tags: [], domain_tags: [] })}
      >
        Apply feed
      </button>
      {extraContent}
    </div>
  ),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: OWNER }),
    {
      getState: () => ({
        currentUserPubky: OWNER,
        selectSession: () => ({
          info: {
            publicKey: { z32: () => OWNER },
            capabilities: authState.capabilities,
          },
        }),
      }),
    },
  ),
}));

describe('PubchiFeedBuilder', () => {
  beforeEach(() => {
    authState.capabilities = [];
    vi.clearAllMocks();
  });

  it('denies a stale session before creating a feed', async () => {
    render(<PubchiFeedBuilder proposal={proposal} open onOpenChange={vi.fn()} onInterpret={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Apply feed' }));

    await vi.waitFor(() => expect(vi.mocked(FeedController.commitCreate)).not.toHaveBeenCalled());
    expect(vi.mocked(PubchiController.commitRecordBuiltFeed)).not.toHaveBeenCalled();
    expect(vi.mocked(publishPubchiSync)).not.toHaveBeenCalled();
  });

  it('reports a provenance failure as a warning after applying the feed', async () => {
    authState.capabilities = ['/:rw'];
    vi.mocked(FeedController.commitCreate).mockResolvedValue(feed);
    vi.mocked(PubchiController.commitRecordBuiltFeed).mockRejectedValue(new Error('provenance unavailable'));

    render(<PubchiFeedBuilder proposal={proposal} open onOpenChange={vi.fn()} onInterpret={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply feed' }));

    await vi.waitFor(() => expect(vi.mocked(publishPubchiSync)).toHaveBeenCalledWith(OWNER, 'created'));
    const { toast } = await import('@/molecules/Toaster/toast');
    expect(toast).toHaveBeenCalledWith({
      variant: 'warning',
      title: "Feed applied, but couldn't save its Pubchi record",
    });
  });
});
