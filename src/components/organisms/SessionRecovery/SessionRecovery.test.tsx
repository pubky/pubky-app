import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import { useSessionRecovery } from '@/hooks/useSessionRecovery/useSessionRecovery';
import { SessionRecovery } from './SessionRecovery';

vi.mock('@/hooks/useMobileAuth/useMobileAuth');
vi.mock('@/hooks/useSessionRecovery/useSessionRecovery');
vi.mock('@/organisms/DialogRestoreEncryptedFile/DialogRestoreEncryptedFile', () => ({
  DialogRestoreEncryptedFile: () => <button>Use a backup file</button>,
}));
vi.mock('@/organisms/DialogRestoreRecoveryPhrase/DialogRestoreRecoveryPhrase', () => ({
  DialogRestoreRecoveryPhrase: () => <button>Use a recovery phrase</button>,
}));
const retry = vi.fn();
const authorize = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSessionRecovery).mockReturnValue({ retry });
  vi.mocked(useMobileAuth).mockReturnValue({
    url: 'pubkyauth://grant',
    isLoading: false,
    isExpired: false,
    fetchUrl: vi.fn(),
    copyAuthUrl: vi.fn(),
    isOpeningRing: false,
    onAuthorizeClick: authorize,
  });
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
    expect(screen.getByRole('button', { name: 'Use a backup file' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use a recovery phrase' })).toBeInTheDocument();
  });
});
