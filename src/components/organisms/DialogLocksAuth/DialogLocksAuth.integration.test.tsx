import type { Session as LocksSdkSession } from '@synonymdev/locks-sdk';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import { LocksService } from '@/services/locks/locks';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { LOCKS_AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { asOpaque } from '@/test-utils/type-assertions';
import { DialogLocksAuth } from './DialogLocksAuth';

/**
 * Integration test of the creator's Paykit setup-status check (#2627): real dialog, real Paykit setup
 * hook, real Locks controller → application → service and the real Locks auth store. Faked: the SDK
 * session (the IO boundary), the two SDK calls that need its wasm (restore, config write) and the Lock
 * Server `/connect` iframe flow, whose callback is handed to the controller directly.
 */

const mocks = vi.hoisted(() => ({
  paykitSetupStatus: vi.fn(),
  signout: vi.fn(),
  prepare: vi.fn(),
  start: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@/hooks/useLocksAuthFlow/useLocksAuthFlow', () => ({
  useLocksAuthFlow: () => ({
    status: 'idle', // LocksAuthFlowStatus.IDLE; the hoisted factory cannot import the enum
    connectUrl: null,
    session: null,
    error: null,
    iframeRef: { current: null },
    prepare: mocks.prepare,
    start: mocks.start,
    reset: mocks.reset,
  }),
}));

vi.mock('@/config/network', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/network')>()),
  getPaykitServerUrl: () => 'https://paykit.server',
}));

/** A Locks session as the SDK hands it out; the creator calls reach the Lock Server through it. */
const fakeSession = () =>
  asOpaque<LocksSdkSession>({ creator: { paykitSetupStatus: mocks.paykitSetupStatus }, signout: mocks.signout });

/** The store once the Lock Server step is done: a live session, and no answer about Paykit yet. */
const signIn = () => useLocksAuthStore.getState().init({ session: fakeSession(), secret: 'secret-abc' });

const renderDialog = () => render(<DialogLocksAuth open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

const setupIframe = () => screen.queryByTitle('Bitkit payout account setup');

describe('DialogLocksAuth - Paykit setup status (#2627)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signout.mockResolvedValue(undefined);
    localStorage.removeItem(LOCKS_AUTH_PERSIST_KEY);
    useLocksAuthStore.setState(locksAuthInitialState);
    useAuthStore.setState(authInitialState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('checking: opens nothing while the Lock Server answers', () => {
    signIn();
    mocks.paykitSetupStatus.mockReturnValue(new Promise(() => {}));
    renderDialog();

    expect(screen.getByText('Checking whether your Bitkit wallet is connected.')).toBeInTheDocument();
    expect(mocks.paykitSetupStatus).toHaveBeenCalledTimes(1);
    expect(setupIframe()).not.toBeInTheDocument();
    expect(screen.queryByText('Locks Enabled')).not.toBeInTheDocument();
  });

  it('ready: skips the Bitkit setup and records payout as connected for this session', async () => {
    signIn();
    mocks.paykitSetupStatus.mockResolvedValue({ status: 'ready' });
    renderDialog();

    expect(await screen.findByText('Locks Enabled')).toBeInTheDocument();
    expect(setupIframe()).not.toBeInTheDocument();
    expect(mocks.paykitSetupStatus).toHaveBeenCalledWith(); // no creator argument: the session says who
    expect(useLocksAuthStore.getState().selectIsPaykitConnected()).toBe(true);
  });

  it('setup_required: opens the Bitkit setup as before', async () => {
    signIn();
    mocks.paykitSetupStatus.mockResolvedValue({ status: 'setup_required' });
    renderDialog();

    const iframe = await screen.findByTitle('Bitkit payout account setup');
    expect(iframe.getAttribute('src')).toMatch(/^https:\/\/paykit\.server\/setup\?/);
    expect(useLocksAuthStore.getState().selectIsPaykitConnected()).toBe(false);
  });

  it('unavailable: offers a retry instead of opening the setup', async () => {
    signIn();
    mocks.paykitSetupStatus
      .mockResolvedValueOnce({ status: 'unavailable' })
      .mockResolvedValueOnce({ status: 'setup_required' });
    renderDialog();

    expect(await screen.findByText('Payments are unavailable right now. Please try again later.')).toBeInTheDocument();
    expect(setupIframe()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTitle('Bitkit payout account setup')).toBeInTheDocument();
    expect(mocks.paykitSetupStatus).toHaveBeenCalledTimes(2);
  });

  it('reload: checks the restored session instead of showing the setup again', async () => {
    signIn();
    LocksController.markPaykitConnected();
    const persisted = localStorage.getItem(LOCKS_AUTH_PERSIST_KEY) ?? '';
    // The reload: memory is gone, storage still holds what the tab persisted, and the session is
    // rebuilt from the secret.
    useLocksAuthStore.setState(locksAuthInitialState);
    localStorage.setItem(LOCKS_AUTH_PERSIST_KEY, persisted);
    await useLocksAuthStore.persist.rehydrate();
    vi.spyOn(LocksService, 'restoreSession').mockResolvedValue(fakeSession());
    vi.spyOn(LocksService, 'setLockServiceConfig').mockResolvedValue(undefined);
    await LocksController.restorePersistedLocksSession();
    expect(useLocksAuthStore.getState().selectIsPaykitConnected()).toBe(false);

    mocks.paykitSetupStatus.mockResolvedValue({ status: 'ready' });
    renderDialog();

    expect(await screen.findByText('Locks Enabled')).toBeInTheDocument();
    expect(setupIframe()).not.toBeInTheDocument();
  });

  it('sign-out and sign-in: checks the new Locks session instead of showing the setup again', async () => {
    signIn();
    LocksController.markPaykitConnected();
    await LocksController.logout(); // pubky.app sign-out drops the Locks session with it
    expect(mocks.signout).toHaveBeenCalledTimes(1);

    mocks.paykitSetupStatus.mockResolvedValue({ status: 'ready' });
    renderDialog();
    expect(screen.getByText('Lock Content')).toBeInTheDocument(); // signed out: the dialog opens at the intro

    // Signing in again: the Lock Server step hands its callback code to the controller.
    vi.spyOn(LocksService, 'exchangeSessionCode').mockResolvedValue({ session: fakeSession(), secret: 'secret-new' });
    vi.spyOn(LocksService, 'setLockServiceConfig').mockResolvedValue(undefined);
    await act(async () => {
      await LocksController.completeAuthFromCallback({ code: 'CODE', state: 'STATE' });
    });

    expect(await screen.findByText('Locks Enabled')).toBeInTheDocument();
    expect(setupIframe()).not.toBeInTheDocument();
    expect(mocks.paykitSetupStatus).toHaveBeenCalledTimes(1);
  });
});
