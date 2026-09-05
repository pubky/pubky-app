import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { useFollowAll } from '@/hooks/useFollowAll/useFollowAll';
import { useStarterPackSuggestions } from '@/hooks/useStarterPackSuggestions/useStarterPackSuggestions';
import type { SuggestedUser } from '@/hooks/useStarterPackSuggestions/useStarterPackSuggestions.types';
import { useHomeStore } from '@/stores/home/home.store';
import { homeInitialState, REACH } from '@/stores/home/home.types';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { FollowBestMatchesForm } from './FollowBestMatchesForm';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const ACTIVE_PUBKY = 'follow-form-test-pubky';
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: ACTIVE_PUBKY }),
}));

vi.mock('@/hooks/useStarterPackSuggestions/useStarterPackSuggestions', () => ({
  useStarterPackSuggestions: vi.fn(),
}));

vi.mock('@/hooks/useFollowAll/useFollowAll', () => ({
  useFollowAll: vi.fn(),
}));

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: ({ name }: { name: string }) => <div data-testid="avatar" aria-label={name} />,
}));

function makeUser(id: string, overrides: Partial<SuggestedUser> = {}): SuggestedUser {
  return {
    id,
    name: `User ${id}`,
    bio: '',
    image: null,
    avatarUrl: null,
    status: null,
    counts: { posts: 1, tags: 2, followers: 0, following: 0 },
    isFollowing: false,
    tags: [],
    matchingTags: [],
    ...overrides,
  };
}

const mockHandleFollowClick = vi.fn();
const mockIsUserLoading = vi.fn((_userId: string) => false);
const mockPreserveFollowedUser = vi.fn();
const mockFollowAll = vi.fn();

function mockSuggestions(
  users: SuggestedUser[],
  overrides: Partial<ReturnType<typeof useStarterPackSuggestions>> = {},
) {
  const unfollowedUsers = users.filter((u) => !u.isFollowing);
  vi.mocked(useStarterPackSuggestions).mockReturnValue({
    users,
    unfollowedUsers,
    followedCount: users.length - unfollowedUsers.length,
    isLoading: false,
    error: null,
    handleFollowClick: mockHandleFollowClick,
    isUserLoading: mockIsUserLoading,
    isFollowPending: false,
    preserveFollowedUser: mockPreserveFollowedUser,
    ...overrides,
  });
}

function mockFollowAllState(overrides: Partial<ReturnType<typeof useFollowAll>> = {}) {
  vi.mocked(useFollowAll).mockReturnValue({
    followAll: mockFollowAll,
    isRunning: false,
    progress: { completed: 0, total: 0 },
    ...overrides,
  });
}

describe('FollowBestMatchesForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFollowAll.mockResolvedValue({ followed: [], failed: [], skipped: [] });
    mockIsUserLoading.mockReturnValue(false);
    mockSuggestions([]);
    mockFollowAllState();
    useOnboardingStore.setState({ hasHydrated: true, interestTags: [], experienceCompletedByPubky: {} });
    useHomeStore.setState({ ...homeInitialState, hasHydrated: true });
  });

  it('renders the illustration, heading, navigation and the suggestions grid', () => {
    mockSuggestions([makeUser('a'), makeUser('b')]);

    render(<FollowBestMatchesForm />);

    expect(screen.getByAltText('Follow your best matches')).toBeInTheDocument();
    expect(screen.getByText('Suggested people')).toBeInTheDocument();
    expect(screen.getByTestId('suggested-people-grid')).toBeInTheDocument();
    expect(screen.getByTestId('suggested-user-card-a')).toBeInTheDocument();
    expect(screen.getByTestId('suggested-user-card-b')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /finish/i })).not.toBeDisabled();
  });

  it('shows the skeleton grid and hides Follow all while loading', () => {
    mockSuggestions([], { isLoading: true });

    render(<FollowBestMatchesForm />);

    expect(screen.getByTestId('suggested-people-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('follow-all-btn')).not.toBeInTheDocument();
  });

  it('shows an empty state without Follow all when there are no suggestions', () => {
    render(<FollowBestMatchesForm />);

    expect(screen.getByTestId('suggested-people-empty')).toHaveTextContent(
      'No suggestions yet. You can still finish and explore.',
    );
    expect(screen.queryByTestId('follow-all-btn')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /finish/i })).not.toBeDisabled();
  });

  it('shows an unavailable message when the stream errored', () => {
    mockSuggestions([], { error: 'boom' });

    render(<FollowBestMatchesForm />);

    expect(screen.getByTestId('suggested-people-empty')).toHaveTextContent('Suggestions are unavailable right now.');
  });

  it('wires Follow all to the orchestration hook with preservation and the unfollowed count', () => {
    mockSuggestions([makeUser('a'), makeUser('b', { isFollowing: true }), makeUser('c')]);

    render(<FollowBestMatchesForm />);

    expect(vi.mocked(useFollowAll)).toHaveBeenCalledWith({ onFollowed: mockPreserveFollowedUser });
    const followAllButton = screen.getByTestId('follow-all-btn');
    expect(followAllButton).toHaveTextContent('Follow all (2)');

    fireEvent.click(followAllButton);

    expect(mockFollowAll).toHaveBeenCalledWith([
      { id: 'a', isFollowing: false },
      { id: 'c', isFollowing: false },
    ]);
  });

  it('hides Follow all once every suggestion is followed', () => {
    mockSuggestions([makeUser('a', { isFollowing: true })]);

    render(<FollowBestMatchesForm />);

    expect(screen.queryByTestId('follow-all-btn')).not.toBeInTheDocument();
  });

  it('reflects progress and locks navigation and cards while Follow all runs', () => {
    mockSuggestions([makeUser('a'), makeUser('b')]);
    mockFollowAllState({ isRunning: true, progress: { completed: 1, total: 2 } });

    render(<FollowBestMatchesForm />);

    const followAllButton = screen.getByTestId('follow-all-btn');
    expect(followAllButton).toHaveTextContent('Following 1/2');
    expect(followAllButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /finish/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Follow User a' })).toBeDisabled();
  });

  it('locks Back and Finish while a per-card follow is still committing', () => {
    // Finish reads `followedCount`, which lags the click until the local follow write lands;
    // navigating during that window would decide the landing feed from a stale count.
    mockSuggestions([makeUser('a'), makeUser('b')], { isFollowPending: true });
    mockIsUserLoading.mockImplementation((id: string) => id === 'a');

    render(<FollowBestMatchesForm />);

    expect(screen.getByRole('button', { name: /finish/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
    // Follow all stays available: it has its own lock and other cards are still actionable
    expect(screen.getByTestId('follow-all-btn')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Follow User b' })).not.toBeDisabled();
  });

  it('forwards per-card follow clicks to the preservation-aware handler', () => {
    mockSuggestions([makeUser('a')]);

    render(<FollowBestMatchesForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Follow User a' }));

    expect(mockHandleFollowClick).toHaveBeenCalledWith('a', false, 'User a');
  });

  it('navigates back to the tags step without completing', () => {
    render(<FollowBestMatchesForm />);

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.TAGS);
    expect(useOnboardingStore.getState().experienceCompletedByPubky[ACTIVE_PUBKY]).toBeUndefined();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  describe('Finish', () => {
    it('marks completion, lands on My network with at least one follow, and goes home', () => {
      mockSuggestions([makeUser('a', { isFollowing: true }), makeUser('b')]);

      render(<FollowBestMatchesForm />);
      fireEvent.click(screen.getByRole('button', { name: /finish/i }));

      expect(useOnboardingStore.getState().experienceCompletedByPubky[ACTIVE_PUBKY]).toBe(true);
      const home = useHomeStore.getState();
      expect(home.reach).toBe(REACH.NETWORK);
      expect(home.hasUserSetReach).toBe(true);
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith(APP_ROUTES.HOME);
    });

    it('marks completion and leaves the All feed untouched with zero follows', () => {
      mockSuggestions([makeUser('a'), makeUser('b')]);

      render(<FollowBestMatchesForm />);
      fireEvent.click(screen.getByRole('button', { name: /finish/i }));

      expect(useOnboardingStore.getState().experienceCompletedByPubky[ACTIVE_PUBKY]).toBe(true);
      const home = useHomeStore.getState();
      expect(home.reach).toBe(REACH.ALL);
      // Untouched so the >= 3 follows soft default from useDefaultHomeReach can still apply later
      expect(home.hasUserSetReach).toBe(false);
      expect(mockReplace).toHaveBeenCalledWith(APP_ROUTES.HOME);
    });

    it('still finishes with no suggestions at all', () => {
      render(<FollowBestMatchesForm />);
      fireEvent.click(screen.getByRole('button', { name: /finish/i }));

      expect(useOnboardingStore.getState().experienceCompletedByPubky[ACTIVE_PUBKY]).toBe(true);
      expect(useHomeStore.getState().reach).toBe(REACH.ALL);
      expect(mockReplace).toHaveBeenCalledWith(APP_ROUTES.HOME);
    });
  });
});
