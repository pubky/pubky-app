import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContinueWithPassport } from './ContinueWithPassport';

describe('ContinueWithPassport', () => {
  it('renders the Google button and fires onContinue', () => {
    const onContinue = vi.fn();
    const { container } = render(<ContinueWithPassport onContinue={onContinue} isPending={false} />);

    const button = screen.getByTestId('continue-with-google');
    expect(button).toHaveTextContent('Continue with Google');
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'false');

    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(container).toMatchSnapshot();
  });

  it('is disabled and busy while an attempt is pending', () => {
    const onContinue = vi.fn();
    const { container } = render(<ContinueWithPassport onContinue={onContinue} isPending />);

    const button = screen.getByTestId('continue-with-google');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Waiting for Passport...');

    fireEvent.click(button);
    expect(onContinue).not.toHaveBeenCalled();
    expect(container).toMatchSnapshot();
  });
});
