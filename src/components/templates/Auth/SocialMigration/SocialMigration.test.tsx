import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionReference } from '@/libs/auth/session.types';
import { createCanceledError } from '@/libs/error/auth-flow-canceled';
import { writeSocialMigrationSignedOutNotice } from '@/libs/social-migration/signed-out-notice';
import { useSocialMigrationStore } from '@/stores/socialMigration/socialMigration.store';
import type { SocialMigrationState } from '@/stores/socialMigration/socialMigration.types';
import { mockGrantReference } from '@/test-utils/pubky';
import { SocialMigration } from './SocialMigration';

const mocks = vi.hoisted(() => {
  const authState = {
    hasHydrated: true,
    generation: 'gate',
    restoreStatus: 'social-migration',
    session: null as object | null,
    currentUserPubky: 'account' as string | null,
    sessionReference: null as SessionReference | null,
    isLoggingOut: false,
  };
  const onboardingState = { secretKey: '', signupAttempt: null, hasHydrated: true };
  return { authState, onboardingState, push: vi.fn(), logout: vi.fn(), retry: vi.fn(), acknowledge: vi.fn() };
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: typeof mocks.authState) => unknown) => selector(mocks.authState),
}));
vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: (selector: (state: typeof mocks.onboardingState) => unknown) => selector(mocks.onboardingState),
}));
vi.mock('@/hooks/useHasBackupAccount/useHasBackupAccount', () => ({
  useHasBackupAccount: () => mocks.authState.sessionReference !== null || mocks.authState.session !== null,
}));
vi.mock('@/libs/identity/identity', () => ({ Identity: { tryZ32FromSecret: () => 'account' } }));
vi.mock('@/controllers/auth/auth', () => ({ AuthController: { logout: () => mocks.logout() } }));
vi.mock('@/controllers/social-migration/social-migration', () => ({
  SocialMigrationController: { retry: () => mocks.retry(), acknowledge: () => mocks.acknowledge() },
}));
vi.mock('@/organisms/AlertBackup/AlertBackup', () => ({ AlertBackup: () => <div>Backup controls</div> }));
vi.mock('@/organisms/SocialMigrationProgress/SocialMigrationProgress', () => ({
  SocialMigrationProgress: (props: Record<string, unknown>) => (
    <div data-testid="progress" data-phase={String(props.phase)} data-done={String(props.done)} />
  ),
}));

const heldAccount = () => {
  mocks.authState.currentUserPubky = 'account';
  mocks.authState.sessionReference = mockGrantReference();
  mocks.authState.restoreStatus = 'social-migration';
  mocks.authState.isLoggingOut = false;
};
const signedOut = () => {
  mocks.authState.currentUserPubky = null;
  mocks.authState.sessionReference = null;
  mocks.authState.restoreStatus = 'idle';
  mocks.authState.isLoggingOut = false;
};
const setStore = (state: Partial<SocialMigrationState>) =>
  useSocialMigrationStore.setState({ ...useSocialMigrationStore.getInitialState(), ...state });
const unloadPrevented = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe('SocialMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.logout.mockResolvedValue(undefined);
    mocks.onboardingState.secretKey = '';
    heldAccount();
    setStore({});
  });

  it('shows the running steps and guards the tab while the engine runs', () => {
    setStore({ stage: 'running', phase: 'migrating', done: 3, total: 9 });
    const { unmount } = render(<SocialMigration />);
    expect(screen.getByRole('heading', { name: 'Updating your account' })).toBeInTheDocument();
    expect(screen.getByText(/Do not close this tab/)).toBeInTheDocument();
    expect(screen.getByTestId('progress')).toHaveAttribute('data-phase', 'migrating');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(unloadPrevented()).toBe(true);
    unmount();
    expect(unloadPrevented()).toBe(false);
  });

  it('shows the waiting screen while another tab runs, still guarding the tab', () => {
    setStore({ stage: 'waiting-for-tab' });
    render(<SocialMigration />);
    expect(screen.getByRole('heading', { name: 'Another tab is updating your account' })).toBeInTheDocument();
    expect(unloadPrevented()).toBe(true);
  });

  it('signs the account out once, Strict Mode included, and then offers sign-in with the reason', async () => {
    setStore({ stage: 'reauth-required', reason: 'pre-migration-grant' });
    writeSocialMigrationSignedOutNotice({ reason: 'pre-migration-grant' });
    const { rerender } = render(
      <React.StrictMode>
        <SocialMigration />
      </React.StrictMode>,
    );
    expect(screen.getByRole('heading', { name: 'Your account needs an update' })).toBeInTheDocument();
    expect(screen.getByText(/We are signing you out/)).toBeInTheDocument();
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce());
    expect(unloadPrevented()).toBe(false);

    // Logout reset every store: the notice explains the screen now
    signedOut();
    setStore({});
    rerender(
      <React.StrictMode>
        <SocialMigration />
      </React.StrictMode>,
    );
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(screen.getByText(/Sign in again to grant the new permissions/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.push).toHaveBeenCalledWith('/sign-in');
    expect(sessionStorage.getItem('social-migration:signed-out')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Homepage' }));
    expect(mocks.push).toHaveBeenCalledWith('/');
  });

  it.each([
    ['missing-scopes', /did not include the new permissions/],
    ['session-expired', /Your session ended during the update/],
  ] as const)('explains a %s sign-out from the notice after the stores were reset', (reason, copy) => {
    signedOut();
    writeSocialMigrationSignedOutNotice({ reason });
    render(<SocialMigration />);
    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it('keeps showing the sign-out screen while logout runs', () => {
    setStore({});
    mocks.authState.isLoggingOut = true;
    render(<SocialMigration />);
    expect(screen.getByText(/We are signing you out/)).toBeInTheDocument();
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it('asks for a backup before signing out a browser key that was never backed up', () => {
    setStore({ stage: 'reauth-required', reason: 'pre-migration-grant' });
    mocks.onboardingState.secretKey = 'browser-key';
    render(<SocialMigration />);
    expect(screen.getByRole('heading', { name: 'Back up your key before continuing' })).toBeInTheDocument();
    expect(screen.getByText('Backup controls')).toBeInTheDocument();
    expect(mocks.logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mocks.push).toHaveBeenCalledWith('/logout');
  });

  it('signs out as soon as the backup is confirmed', async () => {
    setStore({ stage: 'reauth-required', reason: 'pre-migration-grant' });
    mocks.onboardingState.secretKey = 'browser-key';
    const { rerender } = render(<SocialMigration />);
    expect(mocks.logout).not.toHaveBeenCalled();
    mocks.onboardingState.secretKey = '';
    rerender(<SocialMigration />);
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce());
  });

  it('offers a retry when the sign-out fails, and stays quiet when a newer flow canceled it', async () => {
    setStore({ stage: 'reauth-required', reason: 'pre-migration-grant' });
    mocks.logout.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    render(<SocialMigration />);
    expect(await screen.findByRole('heading', { name: "We couldn't sign you out yet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(2));

    mocks.logout.mockReset().mockRejectedValue(createCanceledError());
    setStore({ stage: 'reauth-required', reason: 'pre-migration-grant' });
    render(<SocialMigration />);
    await waitFor(() => expect(mocks.logout).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: "We couldn't sign you out yet" })).not.toBeInTheDocument();
  });

  it.each([
    ['incomplete', 'We could not reach your homeserver for some of your data'],
    ['homeserver-unsupported', 'Your homeserver needs an upgrade'],
    ['unexpected', 'Something went wrong'],
  ] as const)('blocks on %s with Retry and Sign out', (reason, title) => {
    setStore({ stage: 'blocked', reason });
    render(<SocialMigration />);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.retry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mocks.push).toHaveBeenCalledWith('/logout');
    expect(unloadPrevented()).toBe(false);
  });

  it('tells how much space a full homeserver needs', () => {
    setStore({ stage: 'blocked', reason: 'quota', needBytes: 37_500_000 });
    render(<SocialMigration />);
    expect(screen.getByRole('heading', { name: 'Your homeserver is out of space' })).toBeInTheDocument();
    expect(screen.getByText(/About 37\.5 MB more is needed/)).toBeInTheDocument();
    act(() => setStore({ stage: 'blocked', reason: 'quota', needBytes: 1024 }));
    expect(screen.getByText(/About 1 MB more is needed/)).toBeInTheDocument();
  });

  it('summarizes what was left behind and continues on acknowledgement', () => {
    setStore({
      stage: 'summary',
      summary: { skipped: { invalid: 2, oversize: 1 }, dropped: { profileImage: 1, profileLinks: 2 } },
    });
    render(<SocialMigration />);
    expect(screen.getByRole('heading', { name: 'Your account is up to date' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Some items could not be carried over: 3 skipped. Your profile picture and 2 profile links need to be set again in Settings.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mocks.acknowledge).toHaveBeenCalledOnce();
  });

  it.each([
    [
      { skipped: {}, dropped: { profileImage: 1, profileLinks: 0 } },
      'Your profile picture needs to be set again in Settings.',
    ],
    [
      { skipped: {}, dropped: { profileImage: 0, profileLinks: 1 } },
      '1 profile link needs to be set again in Settings.',
    ],
    [
      { skipped: { invalid: 1 }, dropped: { profileImage: 0, profileLinks: 0 } },
      'Some items could not be carried over: 1 skipped.',
    ],
  ])('writes only the sentences with a count', (summary, sentence) => {
    setStore({ stage: 'summary', summary });
    render(<SocialMigration />);
    expect(screen.getByText(sentence)).toBeInTheDocument();
  });

  it('waits for hydration before deciding anything', () => {
    mocks.authState.hasHydrated = false;
    setStore({ stage: 'reauth-required', reason: 'pre-migration-grant' });
    render(<SocialMigration />);
    expect(screen.getByText('Checking your account.')).toBeInTheDocument();
    expect(mocks.logout).not.toHaveBeenCalled();
    mocks.authState.hasHydrated = true;
  });
});
