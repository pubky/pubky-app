import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { TagKind } from '@/application/tag/tag.types';
import { PostController } from '@/controllers/post/post';
import { UserController } from '@/controllers/user/user';
import { PostTagPopoverWrapper } from '@/molecules/PostTagPopoverWrapper/PostTagPopoverWrapper';
import { TaggedList } from '@/molecules/TaggedList/TaggedList';
import { renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';

// Keep real rows, Radix popovers, CSS and IntersectionObserver. Only data/auth
// boundaries are replaced so paging is exercised by actual browser scrolling.
vi.mock('@/controllers/user/user', () => ({ UserController: { fetchTaggers: vi.fn() } }));
vi.mock('@/controllers/post/post', () => ({ PostController: { fetchTaggers: vi.fn() } }));
vi.mock('@/controllers/tag/tag', () => ({
  TagController: { getViewerMutation: () => null, subscribeViewerMutations: () => () => {} },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: () => ({ toggleFollow: vi.fn(), isUserLoading: () => false }),
}));
vi.mock('@/hooks/useIsFollowing/useIsFollowing', () => ({
  useIsFollowing: () => ({ isFollowing: false, isLoading: false }),
}));
vi.mock('@/hooks/useTtlSubscription/useTtlSubscription', () => ({ useTtlSubscription: () => ({ ref: () => {} }) }));
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ requireAuth: (action: () => void) => action() }),
}));
vi.mock('@/hooks/useBulkUserAvatars/useBulkUserAvatars', () => ({
  useBulkUserAvatars: () => ({
    getUsersWithAvatars: (ids: string[]) => ids.map((id) => ({ id, name: id, avatarUrl: '' })),
  }),
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector?: (state: { currentUserPubky: string }) => unknown) => {
    const state = { currentUserPubky: 'viewer' };
    return selector ? selector(state) : state;
  },
}));

const ids = Array.from({ length: 51 }, (_, index) => `tagger-${index}`);
ids[10] = 'viewer';
const preview = ids.slice(0, 5).map((id) => ({ id, name: id }));
const tag = { label: 'bitcoin', taggers: preview, taggers_count: 50, relationship: false };
const list = () => page.getByRole('list', { name: 'Who tagged expanded list' });
const rowCount = () => list().element().querySelectorAll('[data-testid^="user-list-item-"]').length;
const scrollToEnd = () => {
  const element = list().element();
  element.scrollTop = element.scrollHeight;
};

beforeEach(() => {
  vi.clearAllMocks();
  const fetchPage = async ({ skip = 0, limit = 50 }) => ({ users: ids.slice(skip, skip + limit), relationship: true });
  vi.mocked(UserController.fetchTaggers).mockImplementation(fetchPage);
  vi.mocked(PostController.fetchTaggers).mockImplementation(fetchPage);
});

describe.each([
  ['desktop', VRT_VIEWPORT_DESKTOP],
  ['mobile', VRT_VIEWPORT_MOBILE],
] as const)('profile taggers in a real browser (%s)', (_name, viewport) => {
  it('scrolls beyond five preview rows and a stale count, retaining rows after a retryable page failure', async () => {
    vi.mocked(UserController.fetchTaggers)
      .mockResolvedValueOnce({ users: ids.slice(0, 50), relationship: true })
      .mockRejectedValueOnce(new Error('offline'));
    await renderForVRT(
      <div className="p-6">
        <TaggedList tags={[tag]} taggedId="profile" taggedKind={TagKind.USER} onTagToggle={vi.fn()} />
      </div>,
      { viewport },
    );
    expect(UserController.fetchTaggers).not.toHaveBeenCalled();
    await page.getByRole('button', { name: 'Show 50 users who tagged' }).click();
    await expect.poll(rowCount).toBe(50);
    // Cached profile membership is false, but the fresh response includes us.
    await expect.element(page.getByRole('button', { name: 'This is you' })).toBeInTheDocument();
    expect(list().element().scrollHeight).toBeGreaterThan(list().element().clientHeight);
    scrollToEnd();
    await expect.element(page.getByRole('button', { name: 'Retry loading taggers' })).toBeVisible();
    expect(rowCount()).toBe(50);
    expect(UserController.fetchTaggers).toHaveBeenCalledTimes(2);
    await page.getByRole('button', { name: 'Retry loading taggers' }).click();
    await expect.poll(rowCount).toBe(51);
    expect(UserController.fetchTaggers).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 50 }));
    await expect.element(page.getByTestId('who-tagged-expanded-list-sentinel')).not.toBeInTheDocument();
  });

  it('keeps a complete preview readable through an initial failure and pending retry', async () => {
    vi.mocked(UserController.fetchTaggers)
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(() => new Promise(() => {}));
    await renderForVRT(
      <div className="p-6">
        <TaggedList
          tags={[{ ...tag, taggers: preview.slice(0, 2), taggers_count: 2 }]}
          taggedId="profile"
          taggedKind={TagKind.USER}
          onTagToggle={vi.fn()}
        />
      </div>,
      { viewport },
    );
    await page.getByRole('button', { name: 'Show 2 users who tagged' }).click();
    await expect.element(page.getByRole('button', { name: 'Retry loading taggers' })).toBeVisible();
    expect(rowCount()).toBe(2);
    expect(UserController.fetchTaggers).toHaveBeenCalledTimes(1);
    await expect.element(page.getByTestId('who-tagged-expanded-list-sentinel')).not.toBeInTheDocument();
    await page.getByRole('button', { name: 'Retry loading taggers' }).click();
    await expect.element(list()).toHaveAttribute('aria-busy', 'true');
    expect(rowCount()).toBe(2);
    await expect.element(page.getByRole('button', { name: "View tagger-0's profile" })).toBeVisible();
  });
});

it('loads the next page inside the home-post nested taggers popover', async () => {
  await renderForVRT(
    <div className="p-20">
      <PostTagPopoverWrapper taggers={preview} taggersCount={51} postId="author:post" tagLabel="bitcoin">
        <button>bitcoin</button>
      </PostTagPopoverWrapper>
    </div>,
    { viewport: VRT_VIEWPORT_DESKTOP },
  );
  await page.getByRole('button', { name: 'bitcoin', exact: true }).hover();
  await page.getByRole('button', { name: 'Show all 51 taggers' }).click();
  await expect.poll(rowCount).toBe(50);
  await expect.element(page.getByRole('button', { name: 'This is you' })).toBeInTheDocument();
  scrollToEnd();
  await expect.poll(rowCount).toBe(51);
  expect(PostController.fetchTaggers).toHaveBeenCalledTimes(2);
  expect(PostController.fetchTaggers).toHaveBeenLastCalledWith(
    expect.objectContaining({ skip: 50, viewerId: 'viewer' }),
  );
});
