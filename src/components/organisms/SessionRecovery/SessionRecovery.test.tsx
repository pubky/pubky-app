import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_ROUTES } from '@/app/routes';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import { usePassportAuth } from '@/hooks/usePassportAuth/usePassportAuth';
import { usePassportEligibility } from '@/hooks/usePassportEligibility/usePassportEligibility';
import { useSessionRecovery } from '@/hooks/useSessionRecovery/useSessionRecovery';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { SessionRecovery } from './SessionRecovery';

vi.mock('@/hooks/useMobileAuth/useMobileAuth');
vi.mock('@/hooks/useIsMobile/useIsMobile');
vi.mock('@/molecules/Toaster/toast');
vi.mock('@/hooks/useSessionRecovery/useSessionRecovery');
vi.mock('@/hooks/usePassportAuth/usePassportAuth');
vi.mock('@/hooks/usePassportEligibility/usePassportEligibility');
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: { loginWithEncryptedFile: vi.fn(), loginWithMnemonic: vi.fn() },
}));
const passport = vi.fn();
const retry = vi.fn();
const authorize = vi.fn();
const fetchUrl = vi.fn();
const mobileAuth = {
  url: 'pubkyauth://grant',
  isLoading: false,
  isExpired: false,
  fetchUrl,
  copyAuthUrl: vi.fn(),
  isOpeningRing: false,
  onAuthorizeClick: authorize,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useIsMobile).mockReturnValue(false);
  vi.mocked(usePassportEligibility).mockReturnValue('disabled');
  vi.mocked(usePassportAuth).mockReturnValue({ startPassportAuth: passport, isPending: false });
  vi.mocked(useSessionRecovery).mockReturnValue({
    retry,
    hasSavedKey: false,
    isRecoveringKey: false,
    recoverSavedKey: vi.fn(),
  });
  vi.mocked(useMobileAuth).mockReturnValue(mobileAuth);
});
describe('SessionRecovery', () => {
  it('offers a bounded retry without launching authorization on a network failure', () => {
    render(<SessionRecovery needsAuthorization={false} />);
    expect(screen.getByText('Could not restore your session')).toBeInTheDocument();
    expect(useMobileAuth).toHaveBeenCalledWith({ autoFetch: false });
    fireEvent.click(screen.getByRole('button', { name: 'Retry saved session' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Open Pubky Ring' })).not.toBeInTheDocument();
  });
  it('offers Ring and recovery-key options for an unrecoverable session', () => {
    render(<SessionRecovery needsAuthorization />);
    expect(screen.getByText('Sign in again to continue')).toBeInTheDocument();
    expect(useMobileAuth).toHaveBeenCalledWith({ autoFetch: true });
    fireEvent.click(screen.getByRole('button', { name: 'Open Pubky Ring' }));
    expect(authorize).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Use encrypted file' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use recovery phrase' })).toBeInTheDocument();
  });
  it('generates a replacement code instead of opening an expired link', () => {
    vi.mocked(useMobileAuth).mockReturnValue({ ...mobileAuth, url: '', isExpired: true });
    render(<SessionRecovery needsAuthorization />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate a new code' }));
    expect(fetchUrl).toHaveBeenCalledOnce();
    expect(authorize).not.toHaveBeenCalled();
  });
  it('prevents opening Ring while the authorization link is loading', () => {
    vi.mocked(useMobileAuth).mockReturnValue({ ...mobileAuth, url: '', isLoading: true });
    render(<SessionRecovery needsAuthorization />);

    const button = screen.getByRole('button', { name: 'Open Pubky Ring' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(authorize).not.toHaveBeenCalled();
  });
  it('keeps explicit signout available during recovery', () => {
    render(<SessionRecovery needsAuthorization={false} />);
    expect(screen.getByRole('link', { name: 'Sign out' })).toHaveAttribute('href', AUTH_ROUTES.LOGOUT);
  });
  it.each([
    ['Use recovery phrase', 'Restore with recovery phrase'],
    ['Use encrypted file', 'Restore with encrypted file'],
  ])('opens the real recovery dialog for %s', (button, title) => {
    render(<SessionRecovery needsAuthorization />);
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName(title);
  });
});

describe('SessionRecovery - Snapshots', () => {
  it('matches snapshot for a temporary restore failure', () => {
    const { container } = render(<SessionRecovery needsAuthorization={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });
  it('matches snapshot for same-account authorization', () => {
    const { container } = render(<SessionRecovery needsAuthorization />);
    expect(container.firstChild).toMatchSnapshot();
  });
  it('matches snapshot while generating an authorization code', () => {
    vi.mocked(useMobileAuth).mockReturnValue({ ...mobileAuth, url: '', isLoading: true });
    const { container } = render(<SessionRecovery needsAuthorization />);
    expect(container.firstChild).toMatchSnapshot();
  });
  it('matches snapshot for an expired authorization code', () => {
    vi.mocked(useMobileAuth).mockReturnValue({ ...mobileAuth, url: '', isExpired: true });
    const { container } = render(<SessionRecovery needsAuthorization />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('SessionRecovery — Passport', () => {
  beforeEach(() => vi.mocked(usePassportEligibility).mockReturnValue('enabled'));
  it('offers Google recovery for the retained account and disables Ring while it is pending', () => {
    vi.mocked(usePassportAuth).mockReturnValue({ startPassportAuth: passport, isPending: true });
    const { rerender } = render(<SessionRecovery needsAuthorization />);
    expect(screen.getByRole('button', { name: 'Open Pubky Ring' })).toBeDisabled();
    vi.mocked(usePassportAuth).mockReturnValue({ startPassportAuth: passport, isPending: false });
    rerender(<SessionRecovery needsAuthorization />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(passport).toHaveBeenCalledOnce();
  });
  it.each(['failed', 'session', 'superseded', 'popup-blocked'] as const)(
    'restarts Ring only for failed Passport, not %s',
    (result) => {
      render(<SessionRecovery needsAuthorization />);
      vi.mocked(usePassportAuth).mock.lastCall?.[0]?.onAttemptSettled?.({ attemptId: 'attempt', result });
      expect(fetchUrl).toHaveBeenCalledTimes(result === 'failed' ? 1 : 0);
    },
  );
  it('does not offer new Google authorization for a temporary restore failure', () => {
    render(<SessionRecovery needsAuthorization={false} />);
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });
});

describe('SessionRecovery - Passport Snapshots', () => {
  it('matches same-account recovery with Google available', () => {
    vi.mocked(usePassportEligibility).mockReturnValue('enabled');
    const { container } = render(<SessionRecovery needsAuthorization />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('SessionRecovery actions', () => {
  it('handles a blocked clipboard with actionable feedback', async () => {
    mobileAuth.copyAuthUrl.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    render(<SessionRecovery needsAuthorization />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy sign-in link' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' })));
  });
  it('keeps the desktop Ring action available without a stuck opening label', () => {
    vi.mocked(useMobileAuth).mockReturnValue({ ...mobileAuth, isOpeningRing: true });
    render(<SessionRecovery needsAuthorization />);
    expect(screen.getByRole('button', { name: 'Open Pubky Ring' })).toBeInTheDocument();
  });
  it('closes the global auth dialog when navigating to logout', () => {
    useAuthStore.setState({ showSignInDialog: true });
    render(<SessionRecovery needsAuthorization={false} />);
    fireEvent.click(screen.getByRole('link', { name: 'Sign out' }));
    expect(useAuthStore.getState().showSignInDialog).toBe(false);
  });

  it('uses the expired QR overlay to regenerate authorization', () => {
    vi.mocked(useMobileAuth).mockReturnValue({ ...mobileAuth, url: '', isExpired: true });
    render(<SessionRecovery needsAuthorization />);
    fireEvent.click(screen.getByRole('button', { name: 'Reload expired QR code' }));
    expect(fetchUrl).toHaveBeenCalledOnce();
  });
  it('copies the sign-in link and shows mobile Ring handoff progress', async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    vi.mocked(useMobileAuth).mockReturnValue({ ...mobileAuth, isOpeningRing: true });
    render(<SessionRecovery needsAuthorization />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy sign-in link' }));
    expect(mobileAuth.copyAuthUrl).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Authentication link copied' })),
    );
    expect(screen.getByRole('button', { name: 'Opening Pubky Ring...' })).toBeInTheDocument();
  });
  it('uses the retained matching key without a file upload', () => {
    const recoverSavedKey = vi.fn();
    vi.mocked(useSessionRecovery).mockReturnValue({
      retry,
      hasSavedKey: true,
      isRecoveringKey: false,
      recoverSavedKey,
    });
    render(<SessionRecovery needsAuthorization />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with saved key' }));
    expect(recoverSavedKey).toHaveBeenCalledOnce();
  });
});

describe('SessionRecovery saved key - Snapshots', () => {
  it('matches compact recovery with an available saved key', () => {
    vi.mocked(useSessionRecovery).mockReturnValue({
      retry,
      hasSavedKey: true,
      isRecoveringKey: false,
      recoverSavedKey: vi.fn(),
    });
    const { container } = render(<SessionRecovery needsAuthorization compact />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('SessionRecovery - Mobile Snapshots', () => {
  it('matches recovery while handing off to Ring on mobile', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    vi.mocked(useMobileAuth).mockReturnValue({ ...mobileAuth, isOpeningRing: true });
    const { container } = render(<SessionRecovery needsAuthorization />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
