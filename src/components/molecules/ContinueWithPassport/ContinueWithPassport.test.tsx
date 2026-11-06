import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContinueWithPassport } from './ContinueWithPassport';

const mockIsPassportAppleEnabled = vi.fn(() => false);

vi.mock('@/config/network', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/network')>()),
  isPassportAppleEnabled: () => mockIsPassportAppleEnabled(),
}));

const HELP_LABEL = 'About signing in with Google';

describe('ContinueWithPassport', () => {
  beforeEach(() => {
    mockIsPassportAppleEnabled.mockReturnValue(false);
  });

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

    // The popover explains everything itself: no link out to the Passport README.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
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

  it('shows the Google logo while Apple is off', () => {
    render(<ContinueWithPassport onContinue={vi.fn()} isPending={false} />);

    const button = screen.getByTestId('continue-with-google');
    expect(button).toHaveAccessibleName('Continue with Google');
    const icons = button.querySelectorAll('svg');
    expect(icons).toHaveLength(1);
    // The Google "G" is a 16x16 custom mark, not a lucide icon.
    expect(icons[0]).toHaveAttribute('viewBox', '0 0 16 16');
    expect(icons[0]).not.toHaveClass('lucide');
    // No line under the pill and nothing describing it: exactly as before the flag.
    expect(screen.queryByTestId('passport-providers-hint')).not.toBeInTheDocument();
    expect(button).not.toHaveAttribute('aria-describedby');
  });

  describe('when Passport also offers Apple', () => {
    beforeEach(() => {
      mockIsPassportAppleEnabled.mockReturnValue(true);
    });

    it('is one generic button with no provider logo and a text-only line naming the accounts', () => {
      const onContinue = vi.fn();
      render(<ContinueWithPassport onContinue={onContinue} isPending={false} />);

      expect(screen.getAllByRole('button', { name: /^Continue with/ })).toHaveLength(1);
      const button = screen.getByTestId('continue-with-google');
      expect(button).toHaveAccessibleName('Continue with Passport');
      // What lies behind the button: one muted line, text only, read as the button's description.
      const hint = screen.getByTestId('passport-providers-hint');
      expect(hint).toHaveTextContent('Sign in with your Google or Apple account');
      expect(hint).toHaveClass('text-muted-foreground', 'text-center');
      expect(hint.querySelector('svg')).toBeNull();
      expect(button).toHaveAccessibleDescription('Sign in with your Google or Apple account');
      // A neutral sign-in icon: the Apple logo belongs only in Passport's Sign in with Apple button.
      const icons = button.querySelectorAll('svg');
      expect(icons).toHaveLength(1);
      expect(icons[0]).toHaveClass('lucide-log-in');

      fireEvent.click(button);
      expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it('mirrors the longer label in the help overlay', () => {
      render(<ContinueWithPassport onContinue={vi.fn()} isPending={false} />);

      const overlay = screen.getByTestId('passport-help-overlay');
      expect(within(overlay).getByText('Continue with Passport')).toHaveClass('invisible');
    });

    it('explains Passport for every account it accepts in the help popover', () => {
      render(<ContinueWithPassport onContinue={vi.fn()} isPending={false} />);

      expect(screen.queryByRole('button', { name: HELP_LABEL })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'About signing in with Passport' }));

      expect(screen.getByText('Continue with Passport, sign in with Google or Apple.')).toBeInTheDocument();
      expect(screen.getByText("Your account's role:")).toBeInTheDocument();
      expect(screen.queryByText("Google's role:")).not.toBeInTheDocument();
      expect(screen.getByText(/Your Google or Apple account helps identify you/)).toBeInTheDocument();
      expect(
        screen.getByText(/on Google Drive or in iCloud\. Google and Apple never see the private key\./),
      ).toBeInTheDocument();
      expect(screen.getByText(/requires both your encrypted backup and a separate recovery key/)).toBeInTheDocument();
      expect(screen.getByText(/Neither your account provider nor Passport can recover/)).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('puts className on the outer wrapper so the line under the pill follows its width', () => {
      const { container } = render(
        <ContinueWithPassport onContinue={vi.fn()} isPending={false} className="w-full sm:w-auto" />,
      );

      const wrapper = container.firstElementChild;
      expect(wrapper).toHaveClass('flex', 'flex-col', 'w-full', 'sm:w-auto');
      expect(wrapper).toContainElement(screen.getByTestId('passport-providers-hint'));
      expect(screen.getByTestId('passport-help-overlay').parentElement).not.toHaveClass('w-full');
    });

    it('keeps the pending label', () => {
      render(<ContinueWithPassport onContinue={vi.fn()} isPending />);

      expect(screen.getByTestId('continue-with-google')).toHaveAccessibleName('Waiting for Passport...');
    });
  });
});
