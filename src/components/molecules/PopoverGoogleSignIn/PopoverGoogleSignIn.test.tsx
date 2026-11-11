import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PopoverGoogleSignIn } from './PopoverGoogleSignIn';

const mockAppleEnabled = vi.hoisted(() => vi.fn(() => false));
vi.mock('@/config/network', () => ({ isPassportAppleEnabled: mockAppleEnabled }));

describe('PopoverGoogleSignIn', () => {
  it.each([false, true])('keeps help copy and its accessible name behind Apple flag=%s', (enabled) => {
    mockAppleEnabled.mockReturnValue(enabled);
    render(<PopoverGoogleSignIn />);
    fireEvent.click(
      screen.getByRole('button', {
        name: enabled ? 'About signing in with Apple or Google' : 'About signing in with Google',
      }),
    );
    expect(
      screen.getByRole('heading', {
        name: enabled ? 'Sign in with Apple or Google' : 'Sign in with Google',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Use an existing account to create or access your pubky with Pubky Passport.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        enabled
          ? /Created in your browser, with an encrypted backup stored in your iCloud or Google Drive/
          : /Created in your browser, with an encrypted backup stored in your Google Drive/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Restoring your pubky requires your encrypted backup and a separate key from Passport/),
    ).toBeInTheDocument();
    expect(screen.getByText('Your keys:')).toBeInTheDocument();
    expect(screen.getByText('Recovery:')).toBeInTheDocument();
    expect(screen.queryByText("Google's role:")).not.toBeInTheDocument();
    expect(screen.queryByText('Split security:')).not.toBeInTheDocument();
    if (!enabled) expect(screen.queryByText(/iCloud|Apple/)).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learn more' })).toHaveAttribute(
      'href',
      'https://github.com/pubky/pubky-passport/blob/main/README.md',
    );
  });
});
