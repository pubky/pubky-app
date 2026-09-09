import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { FollowBestMatches } from './FollowBestMatches';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const ACTIVE_PUBKY = 'follow-template-test-pubky';
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: ACTIVE_PUBKY }),
}));

vi.mock('@/organisms/FollowBestMatchesForm/FollowBestMatchesForm', () => ({
  FollowBestMatchesForm: () => <div data-testid="follow-best-matches-form" />,
}));

describe('FollowBestMatches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOnboardingStore.setState({ hasHydrated: true, interestTags: [], experienceCompletedByPubky: {} });
  });

  it('renders the header and form for an account that has not completed the experience', () => {
    render(<FollowBestMatches />);

    expect(screen.getByTestId('follow-best-matches-content')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Follow your best matches.');
    expect(screen.getByTestId('follow-best-matches-form')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects home without rendering when the active pubky already completed the experience', () => {
    useOnboardingStore.setState({ experienceCompletedByPubky: { [ACTIVE_PUBKY]: true } });

    render(<FollowBestMatches />);

    expect(screen.queryByTestId('follow-best-matches-content')).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith(APP_ROUTES.HOME);
  });

  it('still prompts a different pubky on the same browser', () => {
    useOnboardingStore.setState({ experienceCompletedByPubky: { 'someone-else': true } });

    render(<FollowBestMatches />);

    expect(screen.getByTestId('follow-best-matches-content')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('holds rendering until the persisted completion map is rehydrated', () => {
    useOnboardingStore.setState({ hasHydrated: false });

    render(<FollowBestMatches />);

    expect(screen.queryByTestId('follow-best-matches-content')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
