import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContinueWithPassport } from './ContinueWithPassport';

const HELP_LABEL = 'About signing in with Google';
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
    expect(screen.getByText('Continue with Google, powered by Pubky Passport.')).toBeInTheDocument();
    expect(screen.getByText("Google's role:")).toBeInTheDocument();
    expect(screen.getByText('Your keys:')).toBeInTheDocument();
    expect(screen.getByText('Recovery:')).toBeInTheDocument();
    expect(screen.getByText('Split security:')).toBeInTheDocument();

    // The points read as separate paragraphs, never as a bulleted list.
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    const learnMore = screen.getByRole('link', { name: 'Learn more' });
    expect(learnMore).toHaveAttribute('href', PASSPORT_README_URL);
    expect(learnMore).toHaveAttribute('target', '_blank');
  });

  it('keeps the help mark reachable while an attempt is pending', () => {
    render(<ContinueWithPassport onContinue={vi.fn()} isPending />);

    expect(screen.getByTestId('continue-with-google')).toBeDisabled();
    expect(screen.getByRole('button', { name: HELP_LABEL })).toBeEnabled();
  });

  it.each([
    { state: 'idle', isPending: false, label: 'Continue with Google' },
    { state: 'pending', isPending: true, label: 'Waiting for Passport...' },
  ])('centres the help mark with the icon and label as one group while $state', ({ isPending, label }) => {
    render(<ContinueWithPassport onContinue={vi.fn()} isPending={isPending} />);

    const pill = screen.getByTestId('continue-with-google');
    const help = screen.getByRole('button', { name: HELP_LABEL });
    const overlay = screen.getByTestId('passport-help-overlay');

    // 32px padding on both sides; the label no longer clears a corner-positioned mark.
    expect(pill).toHaveClass('px-8');
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
    expect(overlay).toHaveClass('pointer-events-none', 'absolute', 'inset-0', 'justify-center', 'gap-2', 'px-8');
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

  it('is disabled and busy while an attempt is pending', () => {
    const onContinue = vi.fn();
    render(<ContinueWithPassport onContinue={onContinue} isPending />);

    const button = screen.getByTestId('continue-with-google');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Waiting for Passport...');

    fireEvent.click(button);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
