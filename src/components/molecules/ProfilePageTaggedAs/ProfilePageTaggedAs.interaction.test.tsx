import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserController } from '@/controllers/user/user';
import { ProfilePageTaggedAs } from './ProfilePageTaggedAs';

vi.mock('@/controllers/user/user', () => ({ UserController: { fetchTaggers: vi.fn() } }));
vi.mock('@/controllers/tag/tag', () => ({
  TagController: { getViewerMutations: async () => new Map() },
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
vi.mock('@/hooks/useTagSuggestions/useTagSuggestions', () => ({ useTagSuggestions: () => ({ suggestions: [] }) }));
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

const tags = [{ label: 'bitcoin', taggers: [{ id: 'preview' }], taggers_count: 2, relationship: false }];
const props = { tags, count: 1, variant: 'mobile' as const, onTagClick: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(UserController.fetchTaggers).mockResolvedValue({ users: ['alice', 'bob'], relationship: false });
});

describe('ProfilePageTaggedAs tag input ownership', () => {
  it('lets the viewer add an existing tag outside the preview', async () => {
    const user = userEvent.setup();
    const onTagAdd = vi.fn();
    render(
      <ProfilePageTaggedAs
        {...props}
        pubky="profile"
        onTagAdd={onTagAdd}
        allTags={[...tags, { label: 'outside', taggers: [], taggers_count: 1, relationship: false }]}
      />,
    );
    await user.type(screen.getByRole('textbox'), 'outside{Enter}');
    expect(onTagAdd).toHaveBeenCalledWith('outside');
  });

  it('does not add a duplicate tag already applied by the viewer', async () => {
    const user = userEvent.setup();
    const onTagAdd = vi.fn();
    render(
      <ProfilePageTaggedAs
        {...props}
        pubky="profile"
        onTagAdd={onTagAdd}
        allTags={[...tags, { label: 'mine', taggers: [], taggers_count: 1, relationship: true }]}
      />,
    );
    await user.type(screen.getByRole('textbox'), 'mine{Enter}');
    expect(onTagAdd).not.toHaveBeenCalled();
  });
});

describe('ProfilePageTaggedAs tagger expansion', () => {
  it('loads the viewed profile taggers on avatar activation and collapses on a second click', async () => {
    const user = userEvent.setup();
    render(<ProfilePageTaggedAs {...props} pubky="other-profile" />);
    const trigger = screen.getByRole('button', { name: 'Show 2 users who tagged' });
    expect(UserController.fetchTaggers).not.toHaveBeenCalled();

    await user.click(trigger);

    await screen.findByRole('button', { name: "View alice's profile" });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(UserController.fetchTaggers).toHaveBeenCalledWith({
      user_id: 'other-profile',
      label: 'bitcoin',
      skip: 0,
      limit: 50,
      viewer_id: 'viewer',
    });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Who tagged expanded list' })).not.toBeInTheDocument();
  });

  it('supports keyboard activation for the own-profile fallback', async () => {
    const user = userEvent.setup();
    render(<ProfilePageTaggedAs {...props} />);
    screen.getByRole('button', { name: 'Show 2 users who tagged' }).focus();

    await user.keyboard('{Enter}');

    await screen.findByRole('button', { name: "View bob's profile" });
    expect(UserController.fetchTaggers).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'viewer' }));
  });

  it('resets the expanded preview when the viewed profile changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ProfilePageTaggedAs {...props} pubky="first-profile" />);
    await user.click(screen.getByRole('button', { name: 'Show 2 users who tagged' }));
    await screen.findByRole('button', { name: "View alice's profile" });

    rerender(<ProfilePageTaggedAs {...props} pubky="next-profile" />);

    expect(screen.getByRole('button', { name: 'Show 2 users who tagged' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Who tagged expanded list' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show 2 users who tagged' }));
    await waitFor(() => {
      expect(UserController.fetchTaggers).toHaveBeenLastCalledWith(
        expect.objectContaining({ user_id: 'next-profile' }),
      );
    });
  });
});
