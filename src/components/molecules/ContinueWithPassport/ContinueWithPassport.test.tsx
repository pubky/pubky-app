import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContinueWithPassport } from './ContinueWithPassport';

const HELP_LABEL = 'About signing in with Apple or Google';
const PASSPORT_README_URL = 'https://github.com/pubky/pubky-passport/blob/main/README.md';

describe('ContinueWithPassport', () => {
  it('explains the sign-in from a help mark, which never starts an attempt', () => {
    const onContinue = vi.fn();
    render(<ContinueWithPassport onContinue={onContinue} isPending={false} />);

    const pill = screen.getByTestId('continue-with-google');
    const help = screen.getByRole('button', { name: HELP_LABEL });

    // An interactive element must never nest in another one.
    expect(pill).not.toContainElement(help);
    expect(pill).toHaveAccessibleName('Continue with Google');

    fireEvent.click(help);

    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Sign in with Apple or Google' })).toBeInTheDocument();
    expect(
      screen.getByText('Use an account you already have to create or access your pubky through Pubky Passport.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Your keys:')).toBeInTheDocument();
    expect(screen.getByText('Recovery:')).toBeInTheDocument();

    // The points read as separate paragraphs, never as a bulleted list.
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    const learnMore = screen.getByRole('link', { name: 'Learn more' });
    expect(learnMore).toHaveAttribute('href', PASSPORT_README_URL);
    expect(learnMore).toHaveAttribute('target', '_blank');
  });

  it.each(['google', 'providers'] as const)('keeps help reachable while the %s variant is pending', (variant) => {
    render(<ContinueWithPassport onContinue={vi.fn()} isPending variant={variant} />);

    expect(screen.getByTestId('continue-with-google')).toBeDisabled();
    expect(screen.getByRole('button', { name: HELP_LABEL })).toBeEnabled();
  });

  it('uses the compact provider layout without changing the Passport or help actions', () => {
    const onContinue = vi.fn();
    render(<ContinueWithPassport onContinue={onContinue} isPending={false} variant="providers" />);

    const button = screen.getByRole('button', { name: 'Continue with Google or Apple' });
    expect(button.textContent).toBe('Continue with');
    const help = screen.getByRole('button', { name: HELP_LABEL });
    expect(button).not.toContainElement(help);

    fireEvent.click(help);
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Sign in with Apple or Google' })).toBeInTheDocument();

    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it.each([
    { state: 'idle', isPending: false, label: 'Continue with Google' },
    { state: 'pending', isPending: true, label: 'Waiting for Passport...' },
  ])('centres the help mark with the icon and label as one group while $state', ({ isPending, label }) => {
    render(<ContinueWithPassport onContinue={vi.fn()} isPending={isPending} />);

    const pill = screen.getByTestId('continue-with-google');
    const help = screen.getByRole('button', { name: HELP_LABEL });
    const overlay = screen.getByTestId('passport-help-overlay');

    // Compensate for the help target's 8px trailing padding to centre the visible artwork.
    expect(pill).toHaveClass('px-8', 'pr-6');
    expect(pill).not.toHaveClass('px-12');

    // The pill reserves the mark's slot after its label so the centred group includes it.
    const slot = within(pill).getByTestId('passport-help-slot');
    expect(slot).toHaveClass('size-8');
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    expect(pill.lastElementChild).toBe(slot);
    expect(pill).toHaveAccessibleName(label);

    // The overlay mirrors the group invisibly and lets clicks through, except on the mark itself.
    expect(pill).not.toContainElement(overlay);
    expect(overlay).toContainElement(help);
    expect(overlay).toHaveClass(
      'pointer-events-none',
      'absolute',
      'inset-0',
      'justify-center',
      'gap-2',
      'px-8',
      'pr-6',
    );
    expect(help).toHaveClass('pointer-events-auto');

    const [realLabel, mirroredLabel] = screen.getAllByText(label);
    expect(pill).toContainElement(realLabel);
    expect(overlay).toContainElement(mirroredLabel);
    expect(mirroredLabel).toHaveClass('invisible');
    expect(mirroredLabel).toHaveAttribute('aria-hidden', 'true');
    expect(overlay.lastElementChild).toBe(help);
  });

  it('renders the Google button and fires onContinue', () => {
    const onContinue = vi.fn();
    render(<ContinueWithPassport onContinue={onContinue} isPending={false} />);

    const button = screen.getByTestId('continue-with-google');
    expect(button).toHaveTextContent('Continue with Google');
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'false');

    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it.each(['google', 'providers'] as const)('disables the %s variant while an attempt is pending', (variant) => {
    const onContinue = vi.fn();
    render(<ContinueWithPassport onContinue={onContinue} isPending variant={variant} />);

    const button = screen.getByTestId('continue-with-google');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Waiting for Passport...');
    expect(button).toHaveAccessibleName('Waiting for Passport...');

    fireEvent.click(button);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
