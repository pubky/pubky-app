import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BackupNavigation, BackupPageHeader } from './Backup';

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
  Button: ({
    children,
    className,
    onClick,
    disabled,
    variant,
    size,
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    size?: string;
  }) => (
    <button
      data-testid="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
    >
      {children}
    </button>
  ),
  PageHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="page-header">{children}</div>,
  PageSubtitle: ({ children }: { children: React.ReactNode }) => <div data-testid="page-subtitle">{children}</div>,
}));

// Mock molecules
vi.mock('@/molecules', () => ({
  ButtonsNavigation: ({
    className,
    onHandleBackButton,
    onHandleContinueButton,
    loadingContinueButton,
    backText,
    continueText,
  }: {
    className?: string;
    onHandleBackButton?: () => void;
    onHandleContinueButton?: () => void;
    loadingContinueButton?: boolean;
    backText?: string;
    continueText?: string;
  }) => (
    <div data-testid="buttons-navigation" className={className}>
      <button data-testid="back-button" onClick={onHandleBackButton}>
        {backText}
      </button>
      <button
        data-testid="continue-button"
        onClick={onHandleContinueButton}
        disabled={loadingContinueButton}
        data-loading={loadingContinueButton}
      >
        {continueText}
      </button>
    </div>
  ),
  PageTitle: ({ children, size }: { children: React.ReactNode; size?: string }) => (
    <h1 data-testid="page-title" data-size={size}>
      {children}
    </h1>
  ),
}));

// Mock app
vi.mock('@/app', () => ({
  ONBOARDING_ROUTES: {
    HOMESERVER: '/homeserver',
    PUBKY: '/pubky',
    PROFILE: '/profile',
  },
}));

describe('BackupNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot for default BackupNavigation', () => {
    const { container } = render(<BackupNavigation />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders buttons navigation component', () => {
    render(<BackupNavigation />);

    expect(screen.getByTestId('buttons-navigation')).toBeInTheDocument();
    expect(screen.getByTestId('back-button')).toBeInTheDocument();
    expect(screen.getByTestId('continue-button')).toBeInTheDocument();
  });

  it('shows loading state when continue button is clicked', () => {
    render(<BackupNavigation />);

    const continueButton = screen.getByTestId('continue-button');
    expect(continueButton).toHaveAttribute('data-loading', 'false');

    fireEvent.click(continueButton);

    expect(continueButton).toHaveAttribute('data-loading', 'true');
  });

  it('navigates to profile on continue button click', () => {
    render(<BackupNavigation />);

    const continueButton = screen.getByTestId('continue-button');
    fireEvent.click(continueButton);

    expect(mockPush).toHaveBeenCalledWith('/profile');
  });

  it('navigates to pubky on back button click', () => {
    render(<BackupNavigation />);

    const backButton = screen.getByTestId('back-button');
    fireEvent.click(backButton);

    expect(mockPush).toHaveBeenCalledWith('/pubky');
  });
});

describe('BackupPageHeader - Snapshots', () => {
  it('matches snapshot for default BackupPageHeader', () => {
    const { container } = render(<BackupPageHeader />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
