import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { STARTER_PACK_MAX_TAGS, STARTER_PACK_RESERVED_TAGS } from '@/config/nexus';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { TagsOfInterestForm } from './TagsOfInterestForm';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const ACTIVE_PUBKY = 'form-test-pubky';
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: ACTIVE_PUBKY }),
}));

const POPULAR_TAGS = ['bitcoin', 'art', 'music'];
vi.mock('@/hooks/useHotTags/useHotTags', () => ({
  useHotTags: vi.fn(),
}));

vi.mock('@/molecules/TagInput/TagInput', () => ({
  TagInput: ({
    onTagAdd,
    currentTagsCount,
    maxTags,
    viewerTags,
    excludeFromApiSuggestions,
    clearOnLimitReached,
  }: {
    onTagAdd: (tag: string) => void;
    currentTagsCount?: number;
    maxTags?: number;
    viewerTags?: { label: string }[];
    excludeFromApiSuggestions?: string[];
    clearOnLimitReached?: boolean;
  }) => (
    <input
      data-testid="tag-input"
      data-current-count={currentTagsCount}
      data-max-tags={maxTags}
      data-viewer-tags={viewerTags?.map(({ label }) => label).join(',')}
      data-excluded-tags={excludeFromApiSuggestions?.join(',')}
      data-clear-on-limit-reached={clearOnLimitReached}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onTagAdd((e.target as HTMLInputElement).value);
        }
      }}
    />
  ),
}));

describe('TagsOfInterestForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useHotTags).mockReturnValue({
      tags: POPULAR_TAGS.map((name) => ({ name, count: 10 })),
      rawTags: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    useOnboardingStore.setState({
      hasHydrated: true,
      interestTags: [],
      experienceCompletedByPubky: {},
    });
  });

  it('renders the illustration, both sections, the tag input, and navigation', () => {
    render(<TagsOfInterestForm />);

    expect(screen.getByAltText('Tags of interest')).toBeInTheDocument();
    expect(screen.getByText('Popular interests')).toHaveTextContent('Popular interests (0 selected)');
    expect(screen.getByText('Select which topics you find interesting.')).toBeInTheDocument();
    expect(screen.getByText('Your interests')).toBeInTheDocument();
    expect(screen.getByText('Add other topics you like.')).toBeInTheDocument();
    const tagInput = screen.getByTestId('tag-input');
    expect(tagInput).toHaveAttribute('data-max-tags', String(STARTER_PACK_MAX_TAGS));
    expect(tagInput).toHaveAttribute('data-clear-on-limit-reached', 'true');
    expect(tagInput.getAttribute('data-excluded-tags')).toContain(STARTER_PACK_RESERVED_TAGS[0]);
    expect(screen.getByRole('button', { name: /back/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled();
  });

  it('seeds the selection from the persisted store tags', () => {
    useOnboardingStore.setState({ interestTags: ['bitcoin', 'satoshi'] });

    render(<TagsOfInterestForm />);

    expect(screen.getByTestId('popular-tag-bitcoin')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('interest-tag-satoshi')).toBeInTheDocument();
    expect(screen.getByText('Popular interests')).toHaveTextContent('Popular interests (1 selected)');
    expect(screen.getByTestId('tag-input')).toHaveAttribute('data-viewer-tags', 'bitcoin,satoshi');
    expect(screen.getByTestId('tag-input').getAttribute('data-excluded-tags')).toContain('bitcoin');
  });

  it('sanitizes an invalid persisted seed instead of trusting it', () => {
    useOnboardingStore.setState({ interestTags: [' Bitcoin ', 'bitcoin', 'bad tag', 'a'.repeat(21)] });

    render(<TagsOfInterestForm />);

    expect(screen.getByTestId('popular-tag-bitcoin')).toHaveAttribute('aria-pressed', 'true');
    expect(useOnboardingStore.getState().interestTags).toEqual(['bitcoin']);
  });

  it('syncs every selection change to the store without navigating', () => {
    render(<TagsOfInterestForm />);

    fireEvent.click(screen.getByTestId('popular-tag-art'));

    expect(useOnboardingStore.getState().interestTags).toEqual(['art']);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows loading placeholders without temporarily rendering selected tags as custom', () => {
    useOnboardingStore.setState({ interestTags: ['bitcoin', 'satoshi'] });
    vi.mocked(useHotTags).mockReturnValue({
      tags: [],
      rawTags: [],
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<TagsOfInterestForm />);

    expect(screen.getByTestId('popular-interests-loading')).toBeInTheDocument();
    expect(screen.getByText('Popular interests')).not.toHaveTextContent('selected');
    expect(screen.queryByTestId('interest-tag-bitcoin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('interest-tag-satoshi')).not.toBeInTheDocument();
  });

  it('keeps the custom-tag path available when popular interests settle empty', () => {
    vi.mocked(useHotTags).mockReturnValue({
      tags: [],
      rawTags: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TagsOfInterestForm />);

    expect(screen.getByTestId('popular-interests-empty')).toHaveTextContent(
      'Popular interests are unavailable. You can still add your own.',
    );
    expect(screen.getByTestId('tag-input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled();
  });

  it('filters Nexus-reserved labels out of popular interests', () => {
    vi.mocked(useHotTags).mockReturnValue({
      tags: [
        { name: 'bitcoin', count: 10 },
        { name: STARTER_PACK_RESERVED_TAGS[0], count: 10 },
      ],
      rawTags: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TagsOfInterestForm />);

    expect(screen.getByTestId('popular-tag-bitcoin')).toBeInTheDocument();
    expect(screen.queryByTestId(`popular-tag-${STARTER_PACK_RESERVED_TAGS[0]}`)).not.toBeInTheDocument();
  });

  it('rejects a Nexus-reserved label submitted through the custom input', () => {
    render(<TagsOfInterestForm />);

    fireEvent.change(screen.getByTestId('tag-input'), { target: { value: STARTER_PACK_RESERVED_TAGS[0] } });
    fireEvent.keyDown(screen.getByTestId('tag-input'), { key: 'Enter' });

    expect(useOnboardingStore.getState().interestTags).toEqual([]);
    expect(screen.queryByTestId(`interest-tag-${STARTER_PACK_RESERVED_TAGS[0]}`)).not.toBeInTheDocument();
  });

  it('preserves the selection when navigating Back to the profile step', () => {
    render(<TagsOfInterestForm />);

    fireEvent.click(screen.getByTestId('popular-tag-bitcoin'));
    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.PROFILE);
    const state = useOnboardingStore.getState();
    expect(state.interestTags).toEqual(['bitcoin']);
    expect(state.experienceCompletedByPubky[ACTIVE_PUBKY]).toBeUndefined();
  });

  it('marks completion and navigates home on Continue', () => {
    render(<TagsOfInterestForm />);

    fireEvent.click(screen.getByTestId('popular-tag-bitcoin'));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const state = useOnboardingStore.getState();
    expect(state.interestTags).toEqual(['bitcoin']);
    expect(state.experienceCompletedByPubky[ACTIVE_PUBKY]).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith(APP_ROUTES.HOME);
    expect(mockPush).not.toHaveBeenCalledWith(APP_ROUTES.HOME);
  });
});
