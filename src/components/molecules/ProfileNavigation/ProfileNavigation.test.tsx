import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileNavigation } from './ProfileNavigation';

describe('ProfileNavigation', () => {
  const defaultProps = {
    continueButtonDisabled: false,
    continueText: 'Finish',
    onContinue: vi.fn(),
  };

  it('renders continue text and calls onContinue', () => {
    const onContinue = vi.fn();
    render(<ProfileNavigation {...defaultProps} onContinue={onContinue} />);

    fireEvent.click(screen.getByRole('button', { name: /Finish/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('calls onHandleBackButton with custom back text', () => {
    const onHandleBackButton = vi.fn();
    render(
      <ProfileNavigation
        {...defaultProps}
        continueText="Complete"
        backText="Previous"
        onHandleBackButton={onHandleBackButton}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Previous/i }));
    expect(onHandleBackButton).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Complete/i })).toBeInTheDocument();
  });

  it('disables continue and back buttons when requested', () => {
    render(<ProfileNavigation {...defaultProps} continueButtonDisabled backButtonDisabled />);

    expect(screen.getByRole('button', { name: /Finish/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Back/i })).toBeDisabled();
  });

  it('swaps the arrow for a spinner while continueButtonLoading', () => {
    const { rerender } = render(<ProfileNavigation {...defaultProps} />);

    const continueButton = screen.getByRole('button', { name: /Finish/i });
    expect(continueButton.querySelector('.lucide-arrow-right')).toBeInTheDocument();
    expect(continueButton.querySelector('.animate-spin')).not.toBeInTheDocument();

    rerender(<ProfileNavigation {...defaultProps} continueButtonLoading />);

    expect(continueButton).toHaveTextContent('Finish');
    expect(continueButton.querySelector('.animate-spin')).toBeInTheDocument();
    expect(continueButton.querySelector('.lucide-arrow-right')).not.toBeInTheDocument();
  });

  it('hides the continue button when hiddenContinueButton is true', () => {
    render(<ProfileNavigation {...defaultProps} hiddenContinueButton />);

    expect(screen.queryByRole('button', { name: /Finish/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
  });

  it('hides the back button when hiddenBackButton is true', () => {
    render(<ProfileNavigation {...defaultProps} hiddenBackButton />);

    expect(screen.queryByRole('button', { name: /Back/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Finish/i })).toBeInTheDocument();
  });
});
