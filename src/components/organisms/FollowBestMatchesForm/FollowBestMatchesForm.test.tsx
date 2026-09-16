import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { useCreateInterestsFeed } from '@/hooks/useCreateInterestsFeed/useCreateInterestsFeed';
import { useFollowAll } from '@/hooks/useFollowAll/useFollowAll';
import { useFollowingCount } from '@/hooks/useFollowingCount/useFollowingCount';
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

vi.mock('@/hooks/useFollowingCount/useFollowingCount', () => ({
  useFollowingCount: vi.fn(),
}));

vi.mock('@/hooks/useCreateInterestsFeed/useCreateInterestsFeed', () => ({
  useCreateInterestsFeed: vi.fn(),
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
const mockUnpreserveFollowedUser = vi.fn();
const mockFollowAll = vi.fn();
const mockCreateInterestsFeed = vi.fn();

function mockSuggestions(
  users: SuggestedUser[],
  overrides: Partial<ReturnType<typeof useStarterPackSuggestions>> = {},
) {
  vi.mocked(useStarterPackSuggestions).mockReturnValue({
    users,
    unfollowedUsers: users.filter((u) => !u.isFollowing),
    isLoading: false,
    error: null,
    handleFollowClick: mockHandleFollowClick,
    isUserLoading: mockIsUserLoading,
    isFollowPending: false,
    preserveFollowedUser: mockPreserveFollowedUser,
    unpreserveFollowedUser: mockUnpreserveFollowedUser,
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

/** Real follows from the local follow graph; independent from the cards on screen */
function mockFollowingCount(followingCount: number, isLoading = false) {
  vi.mocked(useFollowingCount).mockReturnValue({ followingCount, isLoading });
}

function mockInterestsFeedState(overrides: Partial<ReturnType<typeof useCreateInterestsFeed>> = {}) {
  vi.mocked(useCreateInterestsFeed).mockReturnValue({
    createInterestsFeed: mockCreateInterestsFeed,
    isCreating: false,
    ...overrides,
  });
}

/** Finish awaits the Interests feed before completing, so completion lands after the click settles */
async function expectFinished() {
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(APP_ROUTES.HOME));
}

describe('FollowBestMatchesForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFollowAll.mockResolvedValue({ followed: [], failed: [], skipped: [] });
    mockCreateInterestsFeed.mockResolvedValue(true);
    mockIsUserLoading.mockReturnValue(false);
    mockSuggestions([]);
    mockFollowAllState();
    mockFollowingCount(0);
    mockInterestsFeedState();
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

  it('shows the skeleton grid, hides Follow all and locks navigation while loading', () => {
    mockSuggestions([], { isLoading: true });

    render(<FollowBestMatchesForm />);

    expect(screen.getByTestId('suggested-people-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('follow-all-btn')).not.toBeInTheDocument();
    // Finishing before suggestions settle would decide the landing feed prematurely
    expect(screen.getByRole('button', { name: /finish/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
  });

  it('locks navigation until the real following count has been read', () => {
    mockSuggestions([makeUser('a')]);
    mockFollowingCount(0, true);

    render(<FollowBestMatchesForm />);

    expect(screen.getByRole('button', { name: /finish/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
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

    // Preserve before each commit, roll back on failure — mirrors the single-card path
    expect(vi.mocked(useFollowAll)).toHaveBeenCalledWith({
      onFollowStarted: mockPreserveFollowedUser,
      onFollowFailed: mockUnpreserveFollowedUser,
    });
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

  it('locks Back, Finish and Follow all while a per-card follow is still committing', () => {
    // Finish reads the following count, which lags the click until the local follow write lands;
    // navigating during that window would decide the landing feed from a stale count. Follow all
    // is held too so it cannot race a card whose PUT is still in flight.
    mockSuggestions([makeUser('a'), makeUser('b')], { isFollowPending: true });
    mockIsUserLoading.mockImplementation((id: string) => id === 'a');

    render(<FollowBestMatchesForm />);

    expect(screen.getByRole('button', { name: /finish/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
    expect(screen.getByTestId('follow-all-btn')).toBeDisabled();
    // Other cards stay actionable: each card only reflects its own in-flight state
    expect(screen.getByRole('button', { name: 'Follow User b' })).not.toBeDisabled();
  });

  it('forwards per-card follow clicks to the preservation-aware handler', () => {
    mockSuggestions([makeUser('a')]);

    render(<FollowBestMatchesForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Follow User a' }));

    expect(mockHandleFollowClick).toHaveBeenCalledWith('a', false);
  });

  it('navigates back to the tags step without completing', () => {
    render(<FollowBestMatchesForm />);

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.TAGS);
    expect(useOnboardingStore.getState().experienceCompletedByPubky[ACTIVE_PUBKY]).toBeUndefined();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  describe('Finish', () => {
    it('marks completion, lands on My network with at least one follow, and goes home', async () => {
      mockSuggestions([makeUser('a', { isFollowing: true }), makeUser('b')]);
      mockFollowingCount(1);

      render(<FollowBestMatchesForm />);
      fireEvent.click(screen.getByRole('button', { name: /finish/i }));
      await expectFinished();

      expect(useOnboardingStore.getState().experienceCompletedByPubky[ACTIVE_PUBKY]).toBe(true);
      const home = useHomeStore.getState();
      expect(home.reach).toBe(REACH.NETWORK);
      expect(home.hasUserSetReach).toBe(true);
      expect(mockReplace).toHaveBeenCalledTimes(1);
    });

    it('lands on My network from real follows even when no followed card is on screen', async () => {
      // Back → Continue or a refresh drops preservation and `excludeFollowing` hides the people
      // already followed; the landing feed must still reflect the follows that exist in Dexie.
      mockSuggestions([makeUser('b')]);
      mockFollowingCount(2);

      render(<FollowBestMatchesForm />);
      fireEvent.click(screen.getByRole('button', { name: /finish/i }));
      await expectFinished();

      expect(useHomeStore.getState().reach).toBe(REACH.NETWORK);
    });

    it('marks completion and leaves the All feed untouched with zero follows', async () => {
      mockSuggestions([makeUser('a'), makeUser('b')]);
      mockFollowingCount(0);

      render(<FollowBestMatchesForm />);
      fireEvent.click(screen.getByRole('button', { name: /finish/i }));
      await expectFinished();

      expect(useOnboardingStore.getState().experienceCompletedByPubky[ACTIVE_PUBKY]).toBe(true);
      const home = useHomeStore.getState();
      expect(home.reach).toBe(REACH.ALL);
      // Untouched so the >= 3 follows soft default from useDefaultHomeReach can still apply later
      expect(home.hasUserSetReach).toBe(false);
    });

    it('still finishes with no suggestions at all', async () => {
      render(<FollowBestMatchesForm />);
      fireEvent.click(screen.getByRole('button', { name: /finish/i }));
      await expectFinished();

      expect(useOnboardingStore.getState().experienceCompletedByPubky[ACTIVE_PUBKY]).toBe(true);
      expect(useHomeStore.getState().reach).toBe(REACH.ALL);
    });

    it('creates the Interests feed from the chosen tags before marking completion', async () => {
      useOnboardingStore.setState({ interestTags: ['bitcoin', 'privacy'] });
      let completedWhenCreating: boolean | undefined;
      mockCreateInterestsFeed.mockImplementation(async () => {
        completedWhenCreating = Boolean(useOnboardingStore.getState().experienceCompletedByPubky[ACTIVE_PUBKY]);
        return true;
      });

      render(<FollowBestMatchesForm />);
      fireEvent.click(screen.getByRole('button', { name: /finish/i }));
      await expectFinished();

      expect(mockCreateInterestsFeed).toHaveBeenCalledTimes(1);
      expect(mockCreateInterestsFeed).toHaveBeenCalledWith(['bitcoin', 'privacy']);
      // An interrupted Finish must re-prompt (and upsert the feed) rather than lose the feed
      expect(completedWhenCreating).toBe(false);
      expect(useOnboardingStore.getState().experienceCompletedByPubky[ACTIVE_PUBKY]).toBe(true);
    });

    it('locks navigation and shows the spinner while the Interests feed is being created', () => {
      mockSuggestions([makeUser('a')]);
      mockInterestsFeedState({ isCreating: true });

      render(<FollowBestMatchesForm />);

      const finish = screen.getByRole('button', { name: /finish/i });
      expect(finish).toBeDisabled();
      expect(finish.querySelector('.animate-spin')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
    });

    it('locks the follow toggles while finishing so no follow can land after the count was read', () => {
      mockSuggestions([makeUser('a'), makeUser('b')]);
      mockInterestsFeedState({ isCreating: true });

      render(<FollowBestMatchesForm />);

      expect(screen.getByTestId('follow-all-btn')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Follow User a' })).toBeDisabled();
      // Locked, not in flight: no per-card spinner
      expect(screen.getByRole('button', { name: 'Follow User a' }).querySelector('.animate-spin')).toBeNull();
    });

    it('skips the Interests feed and finishes when no interests were chosen', async () => {
      useOnboardingStore.setState({ interestTags: [] });

      render(<FollowBestMatchesForm />);
      fireEvent.click(screen.getByRole('button', { name: /finish/i }));
      await expectFinished();

      expect(mockCreateInterestsFeed).not.toHaveBeenCalled();
      expect(useOnboardingStore.getState().experienceCompletedByPubky[ACTIVE_PUBKY]).toBe(true);
    });

    it('stays on the step with Finish re-enabled when the Interests feed could not be saved', async () => {
      useOnboardingStore.setState({ interestTags: ['bitcoin'] });
      mockCreateInterestsFeed.mockResolvedValue(false);

      render(<FollowBestMatchesForm />);
      fireEvent.click(screen.getByRole('button', { name: /finish/i }));
      await waitFor(() => expect(mockCreateInterestsFeed).toHaveBeenCalledWith(['bitcoin']));

      // The hook already toasted; the user keeps their selection and can simply try again
      expect(useOnboardingStore.getState().experienceCompletedByPubky[ACTIVE_PUBKY]).toBeUndefined();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /finish/i })).not.toBeDisabled();

      mockCreateInterestsFeed.mockResolvedValue(true);
      fireEvent.click(screen.getByRole('button', { name: /finish/i }));
      await expectFinished();

      expect(mockCreateInterestsFeed).toHaveBeenCalledTimes(2);
      expect(useOnboardingStore.getState().experienceCompletedByPubky[ACTIVE_PUBKY]).toBe(true);
    });
  });
});
