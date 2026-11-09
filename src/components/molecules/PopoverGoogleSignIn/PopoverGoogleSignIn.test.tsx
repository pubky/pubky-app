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
        name: enabled ? 'Sign in with Apple or Google' : 'Continue with Google, powered by Pubky Passport.',
      }),
    ).toBeInTheDocument();
    if (enabled) {
      expect(
        screen.getByText('Use an existing account to create or access your pubky with Pubky Passport.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Created in your browser, with an encrypted backup stored in your iCloud or Google Drive/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Restoring your pubky requires your encrypted backup and a separate key from Passport/),
      ).toBeInTheDocument();
      expect(screen.queryByText("Google's role:")).not.toBeInTheDocument();
    } else {
      expect(screen.getByText(/Helps identify you and securely retrieve your encrypted backup/)).toBeInTheDocument();
      expect(
        screen.getByText(/Keys are created in your browser and encrypted before storage on Google Drive/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Recovery requires both your encrypted Google Drive backup/)).toBeInTheDocument();
      expect(screen.getByText(/Neither Google nor Passport can recover your pubky on its own/)).toBeInTheDocument();
      expect(screen.queryByText(/iCloud|Apple/)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learn more' })).toHaveAttribute(
      'href',
      'https://github.com/pubky/pubky-passport/blob/main/README.md',
    );
  });
});
