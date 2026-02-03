import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PublicKeyHeader, PublicKeyNavigation } from './Pubkey';
import * as App from '@/app';

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock molecules
vi.mock('@/molecules', () => ({
  PageTitle: ({ children, size }: { children: React.ReactNode; size?: string }) => (
    <div data-testid="page-title" data-size={size}>
      {children}
    </div>
  ),
  ButtonsNavigation: ({
    onHandleBackButton,
    onHandleContinueButton,
    loadingContinueButton,
  }: {
    onHandleBackButton: () => void;
    onHandleContinueButton: () => void;
    loadingContinueButton?: boolean;
  }) => (
    <div data-testid="buttons-navigation">
      <button data-testid="back-button" onClick={onHandleBackButton}>
        Back
      </button>
      <button
        data-testid="continue-button"
        onClick={onHandleContinueButton}
        disabled={loadingContinueButton}
        data-loading={loadingContinueButton}
      >
        {loadingContinueButton ? 'Loading...' : 'Continue'}
      </button>
    </div>
  ),
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  PageHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="page-header">{children}</div>,
  PageSubtitle: ({ children }: { children: React.ReactNode }) => <div data-testid="page-subtitle">{children}</div>,
}));

describe('PublicKeyHeader', () => {
  it('renders page header with title and subtitle', () => {
    render(<PublicKeyHeader />);

    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toBeInTheDocument();
    expect(screen.getByTestId('page-subtitle')).toBeInTheDocument();
  });
});

describe('PublicKeyNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders buttons navigation component', () => {
    render(<PublicKeyNavigation />);

    expect(screen.getByTestId('buttons-navigation')).toBeInTheDocument();
    expect(screen.getByTestId('back-button')).toBeInTheDocument();
    expect(screen.getByTestId('continue-button')).toBeInTheDocument();
  });

  it('handles back button click', () => {
    render(<PublicKeyNavigation />);

    const backButton = screen.getByTestId('back-button');
    fireEvent.click(backButton);

    expect(mockPush).toHaveBeenCalledWith(App.ONBOARDING_ROUTES.INSTALL);
  });

  it('handles continue button click', () => {
    render(<PublicKeyNavigation />);

    const continueButton = screen.getByTestId('continue-button');
    fireEvent.click(continueButton);

    expect(mockPush).toHaveBeenCalledWith(App.ONBOARDING_ROUTES.BACKUP);
  });

  it('shows loading state after clicking continue button', () => {
    render(<PublicKeyNavigation />);

    const continueButton = screen.getByTestId('continue-button');
    expect(continueButton).not.toBeDisabled();
    expect(continueButton).toHaveAttribute('data-loading', 'false');

    fireEvent.click(continueButton);

    expect(continueButton).toBeDisabled();
    expect(continueButton).toHaveAttribute('data-loading', 'true');
  });
});

describe('PublicKey Components - Snapshots', () => {
  describe('PublicKeyHeader - Snapshots', () => {
    it('matches snapshot for default PublicKeyHeader', () => {
      const { container } = render(<PublicKeyHeader />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('PublicKeyNavigation - Snapshots', () => {
    it('matches snapshot for default PublicKeyNavigation', () => {
      const { container } = render(<PublicKeyNavigation />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
