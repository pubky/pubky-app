import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_ROUTES } from '@/app/routes';
import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import { useSessionRecovery } from '@/hooks/useSessionRecovery/useSessionRecovery';
import { SessionRecovery } from './SessionRecovery';

vi.mock('@/hooks/useMobileAuth/useMobileAuth');
vi.mock('@/hooks/useSessionRecovery/useSessionRecovery');
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: { loginWithEncryptedFile: vi.fn(), loginWithMnemonic: vi.fn() },
}));
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
  vi.mocked(useSessionRecovery).mockReturnValue({ retry });
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
