import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { ONBOARDING_INTERESTS_SUGGESTED_COUNT } from '@/config/tags';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { TagsOfInterest } from './TagsOfInterest';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const ACTIVE_PUBKY = 'onboarding-test-pubky';
let mockCurrentUserPubky: string | null = ACTIVE_PUBKY;
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mockCurrentUserPubky }),
}));

const POPULAR_TAGS = ['bitcoin', 'art', 'music', 'photography', 'travel', 'food'];
vi.mock('@/hooks/useHotTags/useHotTags', () => ({
  useHotTags: vi.fn(() => ({
    tags: POPULAR_TAGS.map((name) => ({ name, count: 10 })),
    rawTags: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock('@/molecules/TagInput/TagInput', () => ({
  TagInput: ({
    onTagAdd,
    currentTagsCount,
    maxTags,
  }: {
    onTagAdd: (tag: string) => void;
    currentTagsCount?: number;
    maxTags?: number;
  }) => (
    <input
      data-testid="tag-input"
      data-current-count={currentTagsCount}
      data-max-tags={maxTags}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onTagAdd((e.target as HTMLInputElement).value);
        }
      }}
    />
  ),
}));

function addCustomTag(label: string) {
  const input = screen.getByTestId('tag-input');
  fireEvent.change(input, { target: { value: label } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('TagsOfInterest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUserPubky = ACTIVE_PUBKY;
    useOnboardingStore.setState({
      hasHydrated: true,
      interestTags: [],
      experienceCompletedByPubky: {},
    });
  });

  it('requests the configured number of popular tags and renders them as chips', () => {
    render(<TagsOfInterest />);

    expect(vi.mocked(useHotTags)).toHaveBeenCalledWith({ limit: ONBOARDING_INTERESTS_SUGGESTED_COUNT });
    POPULAR_TAGS.forEach((tag) => {
      expect(screen.getByTestId(`popular-tag-${tag}`)).toBeInTheDocument();
    });
  });

  it('updates the "(N selected)" header as popular chips are toggled', () => {
    render(<TagsOfInterest />);

    expect(screen.getByText('Popular interests')).toHaveTextContent('Popular interests (0 selected)');

    fireEvent.click(screen.getByTestId('popular-tag-bitcoin'));
    fireEvent.click(screen.getByTestId('popular-tag-art'));

    expect(screen.getByText('Popular interests')).toHaveTextContent('Popular interests (2 selected)');

    fireEvent.click(screen.getByTestId('popular-tag-art'));

    expect(screen.getByText('Popular interests')).toHaveTextContent('Popular interests (1 selected)');
  });

  it('marks selected chips with accessible pressed state', () => {
    render(<TagsOfInterest />);

    const chip = screen.getByTestId('popular-tag-bitcoin');
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders free-text tags as removable chips under Your interests', () => {
    render(<TagsOfInterest />);

    addCustomTag('satoshi');

    const chip = screen.getByTestId('interest-tag-satoshi');
    expect(chip).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remove satoshi tag'));

    expect(screen.queryByTestId('interest-tag-satoshi')).not.toBeInTheDocument();
  });

  it('selects the popular chip instead of duplicating when free text matches a popular label', () => {
    render(<TagsOfInterest />);

    addCustomTag('Bitcoin');

    expect(screen.getByTestId('popular-tag-bitcoin')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('interest-tag-bitcoin')).not.toBeInTheDocument();
    expect(screen.getByText('Popular interests')).toHaveTextContent('Popular interests (1 selected)');
  });

  it('disables only unselected popular chips at the cap and keeps removal working', () => {
    render(<TagsOfInterest />);

    const selected = POPULAR_TAGS.slice(0, 5);
    selected.forEach((tag) => fireEvent.click(screen.getByTestId(`popular-tag-${tag}`)));

    // Unselected chip locks, selected chips stay interactive
    expect(screen.getByTestId('popular-tag-food')).toBeDisabled();
    selected.forEach((tag) => {
      expect(screen.getByTestId(`popular-tag-${tag}`)).not.toBeDisabled();
    });

    // Deselecting at the cap still works and unlocks the rest
    fireEvent.click(screen.getByTestId('popular-tag-bitcoin'));

    expect(screen.getByTestId('popular-tag-bitcoin')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('popular-tag-food')).not.toBeDisabled();
  });

  it('keeps Continue enabled with zero tags and completes with an empty selection', () => {
    render(<TagsOfInterest />);

    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(continueButton).not.toBeDisabled();

    fireEvent.click(continueButton);

    const state = useOnboardingStore.getState();
    expect(state.interestTags).toEqual([]);
    expect(state.experienceCompletedByPubky[ACTIVE_PUBKY]).toBe(true);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(APP_ROUTES.HOME);
    expect(mockPush).not.toHaveBeenCalledWith(APP_ROUTES.HOME);
    expect(screen.getByTestId('tags-of-interest-content')).toBeInTheDocument();
  });

  it('persists the ordered selection and marks completion on Continue', () => {
    render(<TagsOfInterest />);

    fireEvent.click(screen.getByTestId('popular-tag-music'));
    addCustomTag('satoshi');
    fireEvent.click(screen.getByTestId('popular-tag-bitcoin'));

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const state = useOnboardingStore.getState();
    expect(state.interestTags).toEqual(['music', 'satoshi', 'bitcoin']);
    expect(state.experienceCompletedByPubky[ACTIVE_PUBKY]).toBe(true);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(APP_ROUTES.HOME);
    expect(mockPush).not.toHaveBeenCalledWith(APP_ROUTES.HOME);
  });

  it('navigates back to the profile step without completing', () => {
    render(<TagsOfInterest />);

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.PROFILE);
    expect(useOnboardingStore.getState().experienceCompletedByPubky[ACTIVE_PUBKY]).toBeUndefined();
  });

  it('restores the selection after a Back round trip to the profile step', () => {
    const { unmount } = render(<TagsOfInterest />);

    fireEvent.click(screen.getByTestId('popular-tag-bitcoin'));
    addCustomTag('satoshi');
    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    // Simulate the route change to the profile step and back
    unmount();
    render(<TagsOfInterest />);

    expect(screen.getByTestId('popular-tag-bitcoin')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('interest-tag-satoshi')).toBeInTheDocument();
    expect(useOnboardingStore.getState().interestTags).toEqual(['bitcoin', 'satoshi']);
  });

  it('redirects home without rendering when the active pubky already completed the experience', () => {
    useOnboardingStore.setState({
      experienceCompletedByPubky: { [ACTIVE_PUBKY]: true },
    });

    render(<TagsOfInterest />);

    expect(screen.queryByTestId('tags-of-interest-content')).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith(APP_ROUTES.HOME);
  });

  it('still prompts a different pubky on the same browser', () => {
    useOnboardingStore.setState({
      experienceCompletedByPubky: { 'someone-else': true },
    });

    render(<TagsOfInterest />);

    expect(screen.getByTestId('tags-of-interest-content')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('holds rendering until the persisted completion map is rehydrated', () => {
    useOnboardingStore.setState({ hasHydrated: false });

    render(<TagsOfInterest />);

    expect(screen.queryByTestId('tags-of-interest-content')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
