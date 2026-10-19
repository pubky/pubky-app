import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import type { UseContextualBannerResult } from '@/hooks/useContextualBanner/useContextualBanner.types';
import type {
  PassportAttemptResult,
  PassportAttemptSettledEvent,
  UsePassportAuthOptions,
} from '@/hooks/usePassportAuth/usePassportAuth.types';
import type { PassportEligibility } from '@/hooks/usePassportEligibility/usePassportEligibility.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { GuestContextualBanner } from './GuestContextualBanner';

const COPY = {
  headline: 'Enjoying this video?',
  body: 'Join Pubky to reply to Satoshi, tag this video, and discover more posts.',
};

const mocks = vi.hoisted(() => ({
  banner: { visible: false, copy: { headline: '', body: '' } } as UseContextualBannerResult,
  /** Subscribers of the `useContextualBanner` double, notified when a test changes `banner`. */
  bannerListeners: new Set<() => void>(),
  joinRoute: '/onboarding/join',
  eligibility: 'enabled' as PassportEligibility,
  isPending: false,
  startPassportAuth: vi.fn(),
  /** Ends the running Passport attempt, the way `usePassportAuth` does: through the latest committed handler. */
  settle: null as ((event: PassportAttemptSettledEvent) => void) | null,
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

// A real hook, like the one it stands in for: a visibility change re-renders the banner.
vi.mock('@/hooks/useContextualBanner/useContextualBanner', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useContextualBanner: () =>
      useSyncExternalStore(
        (listener) => {
          mocks.bannerListeners.add(listener);
          return () => {
            mocks.bannerListeners.delete(listener);
          };
        },
        () => mocks.banner,
      ),
  };
});

vi.mock('@/hooks/useJoinRoute/useJoinRoute', () => ({
  useJoinRoute: () => mocks.joinRoute,
}));

vi.mock('@/hooks/usePassportEligibility/usePassportEligibility', () => ({
  usePassportEligibility: () => mocks.eligibility,
}));

// Like the real hook: the attempt outlives re-renders and, when it settles, calls the
// `onAttemptSettled` from the last committed render (held in a ref an effect keeps current).
// With the real hook double above, React also rejects a render that skips `usePassportAuth`.
vi.mock('@/hooks/usePassportAuth/usePassportAuth', async () => {
  const { useEffect, useRef } = await import('react');
  return {
    usePassportAuth: (options: UsePassportAuthOptions = {}) => {
      const onAttemptSettledRef = useRef(options.onAttemptSettled);
      useEffect(() => {
        onAttemptSettledRef.current = options.onAttemptSettled;
      }, [options.onAttemptSettled]);
      mocks.settle = (event) => onAttemptSettledRef.current?.(event);
      return { startPassportAuth: mocks.startPassportAuth, isPending: mocks.isPending };
    },
  };
});

function setBanner(visible: boolean) {
  mocks.banner = { visible, copy: COPY };
  mocks.bannerListeners.forEach((listener) => listener());
}

function settlePassportAttempt(result: PassportAttemptResult) {
  expect(mocks.settle).toBeTypeOf('function');
  act(() => {
    mocks.settle?.({ attemptId: 'attempt-1', result });
  });
}

describe('GuestContextualBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBanner(true);
    mocks.joinRoute = ONBOARDING_ROUTES.JOIN;
    mocks.eligibility = 'enabled';
    mocks.isPending = false;
    mocks.settle = null;
    useAuthStore.setState(authInitialState);
  });

  afterEach(() => {
    useAuthStore.setState(authInitialState);
  });

  describe('visibility', () => {
    it('renders nothing while the banner is not visible', () => {
      setBanner(false);

      const { container } = render(<GuestContextualBanner />);

      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByRole('region', { name: 'Join Pubky' })).not.toBeInTheDocument();
    });

    it('renders the banner with the copy, the join route and the sign-in route when visible', () => {
      render(<GuestContextualBanner />);

      expect(screen.getByRole('region', { name: 'Join Pubky' })).toBeInTheDocument();
      const headline = screen.getByText(COPY.headline);
      const body = screen.getByText(COPY.body);
      // copy.headline goes to the headline slot (first), copy.body to the body slot.
      expect(headline.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Join Pubky' })).toHaveAttribute('href', ONBOARDING_ROUTES.JOIN);
      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', AUTH_ROUTES.SIGN_IN);
    });

    it('forwards whatever join route useJoinRoute resolves', () => {
      mocks.joinRoute = ONBOARDING_ROUTES.HUMAN;

      render(<GuestContextualBanner />);

      expect(screen.getByRole('link', { name: 'Join Pubky' })).toHaveAttribute('href', ONBOARDING_ROUTES.HUMAN);
    });

    it('renders an aria-hidden in-flow spacer next to the banner only while visible', () => {
      const { container } = render(<GuestContextualBanner />);

      const region = screen.getByRole('region', { name: 'Join Pubky' });
      const siblings = Array.from(container.children);
      expect(siblings).toHaveLength(2);
      expect(siblings).toContain(region);
      const spacer = siblings.find((element) => element !== region);
      expect(spacer?.tagName).toBe('DIV');
      expect(spacer).toHaveAttribute('aria-hidden', 'true');
      expect(spacer).toBeEmptyDOMElement();

      act(() => {
        setBanner(false);
      });

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('Continue with Google', () => {
    it('renders the Google button when Passport eligibility is enabled', () => {
      render(<GuestContextualBanner />);

      expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    });

    it.each<PassportEligibility>(['pending', 'disabled'])('hides the Google button when eligibility is %s', (value) => {
      mocks.eligibility = value;

      render(<GuestContextualBanner />);

      expect(screen.getByRole('region', { name: 'Join Pubky' })).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      // Neither the button nor its divider: "Sign in" is the last action.
      expect(screen.getByRole('link', { name: 'Sign in' }).nextElementSibling).toBeNull();
    });

    it('starts the Passport flow synchronously when the Google button is clicked', () => {
      render(<GuestContextualBanner />);

      fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

      expect(mocks.startPassportAuth).toHaveBeenCalledTimes(1);
      expect(mocks.push).not.toHaveBeenCalled();
    });

    it('forwards the pending state to the Google button', () => {
      mocks.isPending = true;

      render(<GuestContextualBanner />);

      const googleButton = screen.getByRole('button', { name: 'Waiting for Passport...' });
      expect(googleButton).toBeDisabled();
      expect(googleButton).toHaveAttribute('aria-busy', 'true');

      fireEvent.click(googleButton);

      expect(mocks.startPassportAuth).not.toHaveBeenCalled();
    });
  });

  describe('after a Passport attempt settles', () => {
    it('sends a brand-new account (no profile) to profile creation', () => {
      render(<GuestContextualBanner />);
      act(() => {
        useAuthStore.setState({ hasProfile: false });
      });

      settlePassportAttempt('session');

      expect(mocks.push).toHaveBeenCalledTimes(1);
      expect(mocks.push).toHaveBeenCalledWith(ONBOARDING_ROUTES.PROFILE);
    });

    it('keeps an existing account on the page it was reading', () => {
      render(<GuestContextualBanner />);
      act(() => {
        useAuthStore.setState({ hasProfile: true });
      });

      settlePassportAttempt('session');

      expect(mocks.push).not.toHaveBeenCalled();
    });

    it('does not navigate while the profile state is still unknown', () => {
      render(<GuestContextualBanner />);

      expect(useAuthStore.getState().hasProfile).toBeNull();

      settlePassportAttempt('session');

      expect(mocks.push).not.toHaveBeenCalled();
    });

    it.each<PassportAttemptResult>(['failed', 'popup-blocked', 'superseded'])(
      'does not navigate when the attempt ends as %s',
      (result) => {
        render(<GuestContextualBanner />);
        act(() => {
          useAuthStore.setState({ hasProfile: false });
        });

        settlePassportAttempt(result);

        expect(mocks.push).not.toHaveBeenCalled();
      },
    );

    it('reads hasProfile when the attempt settles, not when the banner rendered', () => {
      useAuthStore.setState({ hasProfile: true });
      render(<GuestContextualBanner />);

      // Session initialization stores the profile flag right before the attempt settles, so the
      // handler from the banner's last render runs before React can render the banner again.
      act(() => {
        useAuthStore.setState({ hasProfile: false });
        mocks.settle?.({ attemptId: 'attempt-1', result: 'session' });
      });

      expect(mocks.push).toHaveBeenCalledTimes(1);
      expect(mocks.push).toHaveBeenCalledWith(ONBOARDING_ROUTES.PROFILE);
    });

    it('still redirects a new account after the banner has hidden itself', () => {
      const { container } = render(<GuestContextualBanner />);

      // Once signed in the visitor is no longer a guest, so the hook reports the banner hidden.
      act(() => {
        setBanner(false);
      });
      expect(container).toBeEmptyDOMElement();

      act(() => {
        useAuthStore.setState({ hasProfile: false });
      });
      settlePassportAttempt('session');

      expect(mocks.push).toHaveBeenCalledWith(ONBOARDING_ROUTES.PROFILE);
    });
  });
});
