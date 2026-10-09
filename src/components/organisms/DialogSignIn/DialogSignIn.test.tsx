import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { DialogSignIn } from './DialogSignIn';

const authState = vi.hoisted(() => ({
  currentUserPubky: null as string | null,
  restoreStatus: 'idle',
  sessionReference: null as object | null,
}));
const mockShowSignInDialog = vi.hoisted(() => ({ value: false }));
const mockSetShowSignInDialog = vi.hoisted(() => vi.fn());
const mockJoinRoute = vi.hoisted(() => ({ value: '/onboarding/human' }));

// Join entry: fair-access step unless Pubky Passport is enabled on this page.
vi.mock('@/hooks/useJoinRoute/useJoinRoute', () => ({
  useJoinRoute: () => mockJoinRoute.value,
}));

// Mock auth store
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (
    selector: (state: { showSignInDialog: boolean; setShowSignInDialog: typeof mockSetShowSignInDialog }) => unknown,
  ) =>
    selector({
      ...authState,
      showSignInDialog: mockShowSignInDialog.value,
      setShowSignInDialog: mockSetShowSignInDialog,
    }),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: () => void }) => (
    <a data-testid={`link-${href.replace(/\//g, '-')}`} href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

describe('DialogSignIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = null;
    authState.restoreStatus = 'idle';
    authState.sessionReference = null;
    mockShowSignInDialog.value = false;
    mockJoinRoute.value = '/onboarding/human';
  });

  it.each(['idle', 'restoring', 'temporary-error', 'reauth-required'])(
    'offers normal sign-in with a retained account (%s)',
    (status) => {
      mockShowSignInDialog.value = true;
      authState.currentUserPubky = 'retained-account';
      authState.sessionReference = {};
      authState.restoreStatus = status;
      render(<DialogSignIn />);
      expect(screen.getByRole('heading', { name: 'Join Pubky' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('link', { name: 'Sign In' }));
      expect(mockSetShowSignInDialog).toHaveBeenCalledWith(false);
      expect(screen.queryByText(/retry saved session|restoring your session/i)).not.toBeInTheDocument();
    },
  );
  describe('rendering', () => {
    it('renders nothing when store has showSignInDialog=false', () => {
      mockShowSignInDialog.value = false;
      render(<DialogSignIn />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders dialog content when store has showSignInDialog=true', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // Title appears in dialog header
      expect(screen.getByRole('heading', { name: 'Join Pubky' })).toBeInTheDocument();
      expect(screen.getByText('Like what you see? Join the freedom web now.')).toBeInTheDocument();
    });

    it('renders two cards for join and sign in options', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      // Check for the two card headings
      expect(screen.getByText('New here?')).toBeInTheDocument();
      expect(screen.getByText('Already have a pubky?')).toBeInTheDocument();
    });

    it('renders Join Pubky link pointing to human onboarding', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      const joinLink = screen.getByTestId('link--onboarding-human');
      expect(joinLink).toHaveAttribute('href', '/onboarding/human');
      expect(joinLink).toHaveTextContent('Join Pubky');
    });

    it('renders Join Pubky link pointing to the Join step when Passport is enabled', () => {
      mockShowSignInDialog.value = true;
      mockJoinRoute.value = '/onboarding/join';
      render(<DialogSignIn />);

      const joinLink = screen.getByTestId('link--onboarding-join');
      expect(joinLink).toHaveAttribute('href', '/onboarding/join');
      expect(joinLink).toHaveTextContent('Join Pubky');
    });

    it('renders Sign In link pointing to /sign-in', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      const signInLink = screen.getByTestId('link--sign-in');
      expect(signInLink).toHaveAttribute('href', '/sign-in');
      expect(signInLink).toHaveTextContent('Sign In');
    });

    it('renders button icons and card illustrations', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      const dialog = screen.getByRole('dialog');
      expect(dialog.querySelectorAll('.lucide-user-round-plus')).toHaveLength(1);
      expect(dialog.querySelectorAll('.lucide-arrow-right')).toHaveLength(1);
      // next/image optimizes raster assets; assert the underlying public path remains.
      expect(screen.getByAltText('New here?').getAttribute('src')).toContain('new-here.webp');
      expect(screen.getByAltText('Already have a pubky?').getAttribute('src')).toContain('sign-in.webp');
    });
  });

  describe('interactions', () => {
    it('calls setShowSignInDialog(false) when Join Pubky link is clicked', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      const joinLink = screen.getByTestId('link--onboarding-human');
      fireEvent.click(joinLink);

      expect(mockSetShowSignInDialog).toHaveBeenCalledWith(false);
    });

    it('calls setShowSignInDialog(false) when Sign In link is clicked', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      const signInLink = screen.getByTestId('link--sign-in');
      fireEvent.click(signInLink);

      expect(mockSetShowSignInDialog).toHaveBeenCalledWith(false);
    });
  });

  describe('accessibility', () => {
    it('has a visible title for screen readers', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      // The DialogTitle provides accessibility for screen readers
      expect(screen.getByRole('heading', { name: 'Join Pubky' })).toBeInTheDocument();
    });
  });
});

describe('DialogSignIn - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = null;
    authState.restoreStatus = 'idle';
    authState.sessionReference = null;
  });

  it('matches snapshot when open', () => {
    mockShowSignInDialog.value = true;
    render(<DialogSignIn />);

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.parentElement).toMatchSnapshot();
  });

  it('matches snapshot when closed', () => {
    mockShowSignInDialog.value = false;
    const { container } = render(<DialogSignIn />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('DialogSignIn - Mobile Snapshots', () => {
  beforeEach(() => {
    setMobileViewport();
    mockShowSignInDialog.value = true;
    mockJoinRoute.value = '/onboarding/human';
  });
  afterEach(resetViewport);

  it('matches the normal sign-in prompt on mobile', () => {
    render(<DialogSignIn />);
    expect(document.querySelector('[role="dialog"]')?.parentElement).toMatchSnapshot();
  });
});
