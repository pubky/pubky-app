import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DialogSignIn } from './DialogSignIn';

const mockShowSignInDialog = vi.hoisted(() => ({ value: false }));
const mockSetShowSignInDialog = vi.hoisted(() => vi.fn());

// Mock auth store
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (
    selector: (state: { showSignInDialog: boolean; setShowSignInDialog: typeof mockSetShowSignInDialog }) => unknown,
  ) => selector({ showSignInDialog: mockShowSignInDialog.value, setShowSignInDialog: mockSetShowSignInDialog }),
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
    mockShowSignInDialog.value = false;
  });

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
      expect(screen.getByText('Sign in or create an account to interact with posts and profiles.')).toBeInTheDocument();
    });

    it('renders two cards for join and sign in options', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      // Check for the two card headings
      expect(screen.getByText('New here?')).toBeInTheDocument();
      expect(screen.getByText('Already have an account?')).toBeInTheDocument();
    });

    it('renders Join Pubky link pointing to root', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      const joinLink = screen.getByTestId('link--');
      expect(joinLink).toHaveAttribute('href', '/');
      expect(joinLink).toHaveTextContent('Join Pubky');
    });

    it('renders Sign In link pointing to /sign-in', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      const signInLink = screen.getByTestId('link--sign-in');
      expect(signInLink).toHaveAttribute('href', '/sign-in');
      expect(signInLink).toHaveTextContent('Sign In');
    });

    it('renders UserPlus and KeyRound icons', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      const dialog = screen.getByRole('dialog');
      expect(dialog.querySelectorAll('.lucide-user-plus')).toHaveLength(2);
      expect(dialog.querySelectorAll('.lucide-key-round')).toHaveLength(2);
    });
  });

  describe('interactions', () => {
    it('calls setShowSignInDialog(false) when Join Pubky link is clicked', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      const joinLink = screen.getByTestId('link--');
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
