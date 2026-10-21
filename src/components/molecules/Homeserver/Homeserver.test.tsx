import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LEGAL_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { HomeserverFooter, HomeserverHeader, HomeserverNavigation } from './Homeserver';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/molecules/ButtonsNavigation/ButtonsNavigation', () => {
  return {
    ButtonsNavigation: ({
      className,
      onHandleBackButton,
      onHandleContinueButton,
      continueButtonDisabled,
      continueText,
    }: {
      className?: string;
      onHandleBackButton: () => void;
      onHandleContinueButton: () => void;
      continueButtonDisabled: boolean;
      continueText: string;
    }) => (
      <div data-testid="buttons-navigation" className={className}>
        <button data-testid="back-button" onClick={onHandleBackButton}>
          Back
        </button>
        <button data-testid="continue-button" onClick={onHandleContinueButton} disabled={continueButtonDisabled}>
          {continueText}
        </button>
      </div>
    ),
  };
});

vi.mock('@/molecules/Page/Page', () => {
  return {
    PageTitle: ({ children, size }: { children: React.ReactNode; size?: string }) => (
      <div data-testid="page-title" data-size={size}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/organisms/DialogAge/DialogAge', () => {
  return {
    DialogAge: () => <span data-testid="dialog-age">over 18 years old.</span>,
  };
});

vi.mock('@/atoms/PageHeader/PageHeader', () => {
  return {
    PageHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="page-header">{children}</div>,
  };
});

vi.mock('@/atoms/PageSubtitle/PageSubtitle', () => {
  return {
    PageSubtitle: ({ children }: { children: React.ReactNode }) => <div data-testid="page-subtitle">{children}</div>,
  };
});

describe('HomeserverHeader', () => {
  it('renders the homeserver title and subtitle', () => {
    render(<HomeserverHeader />);

    expect(screen.getByTestId('page-title')).toHaveTextContent('Choose');
    expect(screen.getByTestId('page-title')).toHaveTextContent('homeserver.');
    expect(screen.getByTestId('page-subtitle')).toHaveTextContent('Enter your invite code');
  });
});

describe('HomeserverFooter', () => {
  it('opens the Terms of Service and Privacy Policy in a new tab, beside the age confirmation', () => {
    render(<HomeserverFooter />);

    const terms = screen.getByRole('link', { name: 'Terms of Service' });
    expect(terms).toHaveAttribute('href', LEGAL_ROUTES.TERMS_OF_USE);
    expect(terms).toHaveAttribute('target', '_blank');
    const privacy = screen.getByRole('link', { name: 'Privacy Policy' });
    expect(privacy).toHaveAttribute('href', LEGAL_ROUTES.PRIVACY_POLICY);
    expect(privacy).toHaveAttribute('target', '_blank');
    expect(screen.getByTestId('dialog-age')).toBeInTheDocument();
    expect(terms.parentElement).toHaveClass('[&_a]:no-underline');
  });
});

describe('HomeserverNavigation', () => {
  const defaultProps = {
    continueButtonDisabled: false,
    onHandleContinueButton: vi.fn(),
    continueText: 'Continue',
  };

  it('calls the continue handler', () => {
    const onHandleContinueButton = vi.fn();
    render(<HomeserverNavigation {...defaultProps} onHandleContinueButton={onHandleContinueButton} />);

    fireEvent.click(screen.getByTestId('continue-button'));
    expect(onHandleContinueButton).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('navigates back to the backup step', () => {
    render(<HomeserverNavigation {...defaultProps} />);

    fireEvent.click(screen.getByTestId('back-button'));
    expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.BACKUP);
    expect(defaultProps.onHandleContinueButton).not.toHaveBeenCalled();
  });

  it('disables the continue button when requested', () => {
    render(<HomeserverNavigation {...defaultProps} continueButtonDisabled />);
    expect(screen.getByTestId('continue-button')).toBeDisabled();
  });

  it('renders custom continue text', () => {
    render(<HomeserverNavigation {...defaultProps} continueText="Join Server" />);
    expect(screen.getByTestId('continue-button')).toHaveTextContent('Join Server');
  });
});
