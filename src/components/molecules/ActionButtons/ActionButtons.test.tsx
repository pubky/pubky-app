import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionButtons } from './ActionButtons';

const mockAppleEnabled = vi.hoisted(() => vi.fn(() => false));
vi.mock('@/config/network', () => ({ isPassportAppleEnabled: mockAppleEnabled }));

describe('ActionButtons', () => {
  beforeEach(() => mockAppleEnabled.mockReturnValue(false));
  it('renders create account button with default text', () => {
    render(<ActionButtons />);

    const createAccountButton = screen.getByRole('button', { name: /join/i });

    expect(createAccountButton).toBeInTheDocument();

    expect(document.querySelector('.lucide-user-round-plus')).toBeInTheDocument();
  });

  it('calls onCreateAccount when create account button is clicked', () => {
    const mockOnCreateAccount = vi.fn();
    render(<ActionButtons onCreateAccount={mockOnCreateAccount} />);

    const createAccountButton = screen.getByRole('button', { name: /join/i });
    fireEvent.click(createAccountButton);

    expect(mockOnCreateAccount).toHaveBeenCalledTimes(1);
  });

  it('handles create account and explore callbacks', () => {
    const mockOnCreateAccount = vi.fn();
    const mockOnExplore = vi.fn();

    render(<ActionButtons onCreateAccount={mockOnCreateAccount} onExplore={mockOnExplore} />);

    const createAccountButton = screen.getByRole('button', { name: /join/i });
    const exploreButton = screen.getByRole('button', { name: /explore/i });

    fireEvent.click(exploreButton);
    fireEvent.click(createAccountButton);

    expect(mockOnExplore).toHaveBeenCalledTimes(1);
    expect(mockOnCreateAccount).toHaveBeenCalledTimes(1);
  });

  it('renders and calls Learn when onLearn is provided', () => {
    const mockOnLearn = vi.fn();
    render(<ActionButtons onLearn={mockOnLearn} />);

    const learnButton = screen.getByRole('button', { name: /learn/i });
    fireEvent.click(learnButton);

    expect(learnButton).toBeInTheDocument();
    expect(document.querySelector('.lucide-book-open')).toBeInTheDocument();
    expect(mockOnLearn).toHaveBeenCalledTimes(1);
  });

  it('renders and calls Explore when onExplore is provided', () => {
    const mockOnExplore = vi.fn();
    render(<ActionButtons onExplore={mockOnExplore} />);

    const exploreButton = screen.getByRole('button', { name: /explore/i });
    fireEvent.click(exploreButton);

    expect(exploreButton).toBeInTheDocument();
    expect(document.querySelector('.lucide-eye')).toBeInTheDocument();
    expect(mockOnExplore).toHaveBeenCalledTimes(1);
  });

  it('does not render Continue with Google unless a handler is provided', () => {
    render(<ActionButtons onCreateAccount={vi.fn()} />);

    expect(screen.queryByTestId('continue-with-google')).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'renders the gated Passport action for Apple flag=%s and disables it while pending',
    (enabled) => {
      mockAppleEnabled.mockReturnValue(enabled);
      const mockOnContinueWithGoogle = vi.fn();
      const { rerender } = render(
        <ActionButtons onCreateAccount={vi.fn()} onContinueWithGoogle={mockOnContinueWithGoogle} />,
      );

      const googleButton = screen.getByTestId('continue-with-google');
      expect(googleButton).toHaveAccessibleName(enabled ? 'Continue with Google or Apple' : 'Continue with Google');
      fireEvent.click(googleButton);
      expect(mockOnContinueWithGoogle).toHaveBeenCalledTimes(1);

      rerender(
        <ActionButtons
          onCreateAccount={vi.fn()}
          onContinueWithGoogle={mockOnContinueWithGoogle}
          isContinueWithGooglePending
        />,
      );
      expect(screen.getByTestId('continue-with-google')).toBeDisabled();
    },
  );
});
