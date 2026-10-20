import { Keypair } from '@synonymdev/pubky';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '@/controllers/auth/auth';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { onboardingInitialState } from '@/stores/onboarding/onboarding.types';
import { mockGrantReference, mockSession } from '@/test-utils/pubky';
import { Logout } from './Logout';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/controllers/auth/auth', () => ({ AuthController: { logout: vi.fn(async () => {}) } }));
// Backup download has its own tests; retain the real alert, confirmation dialog and stores here.
vi.mock('@/organisms/DialogBackup/DialogBackup', () => ({ DialogBackup: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  const key = Keypair.random();
  useAuthStore.setState({
    ...authInitialState,
    hasHydrated: true,
    currentUserPubky: key.publicKey.z32(),
    generation: 'original',
    session: mockSession(),
    sessionReference: mockGrantReference(),
    restoreStatus: 'ready',
  });
  useOnboardingStore.setState({
    ...onboardingInitialState,
    hasHydrated: true,
    secretKey: Buffer.from(key.secret()).toString('hex'),
  });
});

describe('logout backup confirmation', () => {
  it('retains the key until the real confirmation, then signs out once', async () => {
    render(<Logout />);
    expect(AuthController.logout).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    expect(useOnboardingStore.getState().secretKey).toBeTruthy();
    expect(AuthController.logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm (delete seed)' }));
    await waitFor(() => expect(AuthController.logout).toHaveBeenCalledOnce());
    expect(useOnboardingStore.getState().secretKey).toBeNull();
    expect(await screen.findByText('You have signed out.')).toBeInTheDocument();
  });

  it('does not apply the old confirmation to a replacement account', async () => {
    render(<Logout />);
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    const newKey = Keypair.random();
    const secretKey = Buffer.from(newKey.secret()).toString('hex');
    act(() => {
      useOnboardingStore.setState({ secretKey });
      useAuthStore.setState({ currentUserPubky: newKey.publicKey.z32(), generation: 'replacement' });
    });
    expect(await screen.findByText('Your account changed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm (delete seed)' })).not.toBeInTheDocument();
    expect(AuthController.logout).not.toHaveBeenCalled();
    expect(useOnboardingStore.getState().secretKey).toBe(secretKey);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(AuthController.logout).not.toHaveBeenCalled();
  });
});
