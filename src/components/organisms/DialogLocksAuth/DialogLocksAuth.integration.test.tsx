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
import { MOCK_LOCK_AUTHOR_PUBKY } from '@/test-utils/locks';
import { asOpaque } from '@/test-utils/type-assertions';
import { DialogLocksAuth } from './DialogLocksAuth';

/**
 * Integration test of the creator's Paykit setup-status check (#2627): real dialog, real Paykit setup
 * hook, real Locks controller → application → service and the real Locks auth store. Faked: the SDK
 * session (the IO boundary), the two SDK calls that need its wasm (restore, config write) and the Lock
 * Server `/connect` iframe flow, whose callback is handed to the controller directly. The app's own
 * `/api/paykit-creator` is faked at `fetch`: it is the browser's only way to ask the Paykit Server
 * whether it holds a creator (the Paykit Server sends no CORS headers).
 */

const mocks = vi.hoisted(() => ({
  paykitSetupStatus: vi.fn(),
  probe: vi.fn(),
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
  asOpaque<LocksSdkSession>({
    creator: { paykitSetupStatus: mocks.paykitSetupStatus },
    creatorPubky: () => `pubky${MOCK_LOCK_AUTHOR_PUBKY}`,
    signout: mocks.signout,
  });

/** The store once the Lock Server step is done: a live session, and no answer about Paykit yet. */
const signIn = () =>
  useLocksAuthStore
    .getState()
    .init({ session: fakeSession(), secret: 'secret-abc', creatorPubky: MOCK_LOCK_AUTHOR_PUBKY });

const renderDialog = () => render(<DialogLocksAuth open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

const setupIframe = () => screen.queryByTitle('Bitkit payout account setup');
const reconnectIframe = () => screen.queryByTitle('Bitkit payout account reconnect');

/** What the app's `/api/paykit-creator` answers: Paykit holds the creator, does not, or cannot say. */
const answerProbe = (answer: 'held' | 'not-held' | 'unavailable') =>
  mocks.probe.mockImplementation(async () =>
    answer === 'unavailable'
      ? Response.json({ error: 'Internal server error' }, { status: 500 })
      : Response.json({ held: answer === 'held' }),
  );

/** The iframe Paykit's page posts its outcome from: `error` is what its setup script reports. */
const postPaykitCallback = (iframe: HTMLIFrameElement, error?: string) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://paykit.server',
        source: iframe.contentWindow,
        data: {
          type: 'paykit-setup-callback',
          state: new URL(iframe.src).searchParams.get('state'),
          ...(error && { error }),
        },
      }),
    );
  });

describe('DialogLocksAuth - Paykit setup status (#2627)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks drops call history but keeps a mockResolvedValueOnce queue. A test
    // that fails before consuming its queued answers would hand them to the next test.
    mocks.paykitSetupStatus.mockReset();
    mocks.signout.mockResolvedValue(undefined);
    mocks.probe.mockReset();
    answerProbe('not-held');
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === '/api/paykit-creator') return mocks.probe(url);
      throw new Error(`Unexpected fetch: ${url.href}`);
    });
    localStorage.removeItem(LOCKS_AUTH_PERSIST_KEY);
    useLocksAuthStore.setState(locksAuthInitialState);
    useAuthStore.setState({ ...authInitialState, currentUserPubky: MOCK_LOCK_AUTHOR_PUBKY });
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
    expect(mocks.paykitSetupStatus).toHaveBeenCalledWith('BTC'); // no creator argument: the session says who
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

  it('setup_required and Paykit holds the creator: asks for a reconnect, not a setup it would refuse', async () => {
    signIn();
    mocks.paykitSetupStatus.mockResolvedValue({ status: 'setup_required' });
    answerProbe('held');
    renderDialog();

    expect(await screen.findByRole('button', { name: 'Reconnect Bitkit' })).toBeInTheDocument();
    expect(setupIframe()).not.toBeInTheDocument();
    expect(reconnectIframe()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    const probe: URL = mocks.probe.mock.calls[0][0];
    expect(probe.searchParams.get('creator')).toBe(`pubky${MOCK_LOCK_AUTHOR_PUBKY}`);
    expect(probe.searchParams.get('return_to')).toBe(window.location.origin);
  });

  // The prod log of 23 Oct 2026: auth_complete, session_export, relay_receive, claim_verify,
  // lock_acquire and creator_load all `succeeded`, then no further stage. The refusal of a held
  // creator reaches the iframe as 422 `setup_failed`, which its script posts as `setup-failed`.
  it('setup-failed after auth, claim and creator_load succeed: reconnects instead of looping on Try again', async () => {
    signIn();
    mocks.paykitSetupStatus.mockResolvedValueOnce({ status: 'setup_required' });
    answerProbe('unavailable'); // Paykit cannot say before the setup opens, so `/setup` opens as before
    renderDialog();

    const setup = await screen.findByTitle<HTMLIFrameElement>('Bitkit payout account setup');
    expect(new URL(setup.src).pathname).toBe('/setup');

    answerProbe('held'); // by the time the setup fails, Paykit reports it holds the creator
    await postPaykitCallback(setup, 'setup-failed');

    expect(await screen.findByRole('button', { name: 'Reconnect Bitkit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Paykit setup failed/)).not.toBeInTheDocument();
    expect(setupIframe()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Bitkit' }));

    const reconnect = await screen.findByTitle<HTMLIFrameElement>('Bitkit payout account reconnect');
    const url = new URL(reconnect.src);
    expect(`${url.origin}${url.pathname}`).toBe('https://paykit.server/setup/reconnect');
    expect(url.searchParams.get('creator')).toBe(`pubky${MOCK_LOCK_AUTHOR_PUBKY}`);
    expect(url.searchParams.get('return_to')).toBe(window.location.origin);
    expect(url.searchParams.get('state')).not.toBe(new URL(setup.src).searchParams.get('state'));

    mocks.paykitSetupStatus.mockResolvedValueOnce({ status: 'ready' });
    await postPaykitCallback(reconnect);

    expect(await screen.findByText('Locks Enabled')).toBeInTheDocument();
    expect(useLocksAuthStore.getState().selectIsPaykitConnected()).toBe(true);
  });

  it('setup-failed and Paykit holds no creator: says nothing was set up and offers Connect Bitkit', async () => {
    signIn();
    mocks.paykitSetupStatus.mockResolvedValue({ status: 'setup_required' });
    renderDialog();

    const setup = await screen.findByTitle<HTMLIFrameElement>('Bitkit payout account setup');
    await postPaykitCallback(setup, 'setup-failed');

    expect(await screen.findByText(/nothing was set up yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect Bitkit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Connect Bitkit' }));

    expect(await screen.findByTitle('Bitkit payout account setup')).toBeInTheDocument();
    expect(mocks.paykitSetupStatus).toHaveBeenCalledTimes(2);
  });

  it('setup-failed and Paykit cannot say: shows that payments cannot be checked, not a generic setup error', async () => {
    signIn();
    mocks.paykitSetupStatus.mockResolvedValue({ status: 'setup_required' });
    renderDialog();

    const setup = await screen.findByTitle<HTMLIFrameElement>('Bitkit payout account setup');
    answerProbe('unavailable');
    await postPaykitCallback(setup, 'setup-failed');

    expect(await screen.findByText('Payments are unavailable right now. Please try again later.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect Bitkit' })).not.toBeInTheDocument();
  });

  it('a failed reconnect offers the reconnect again, never the setup Paykit refuses', async () => {
    signIn();
    mocks.paykitSetupStatus.mockResolvedValue({ status: 'setup_required' });
    answerProbe('held');
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'Reconnect Bitkit' }));
    const reconnect = await screen.findByTitle<HTMLIFrameElement>('Bitkit payout account reconnect');
    await postPaykitCallback(reconnect, 'setup-failed');

    expect(await screen.findByText('Reconnecting Bitkit failed.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Bitkit' }));

    const retried = await screen.findByTitle<HTMLIFrameElement>('Bitkit payout account reconnect');
    expect(new URL(retried.src).pathname).toBe('/setup/reconnect');
    expect(setupIframe()).not.toBeInTheDocument();
  });

  it('keeps a confirmed wallet connection when a closed dialog receives a late setup response', async () => {
    signIn();
    const previousCheck = Promise.withResolvers<{ status: 'setup_required' }>();
    mocks.paykitSetupStatus
      .mockReturnValueOnce(previousCheck.promise)
      .mockResolvedValueOnce({ status: 'setup_required' })
      .mockResolvedValueOnce({ status: 'ready' });
    const props = { onOpenChange: vi.fn(), onSuccess: vi.fn() };
    const { rerender } = render(<DialogLocksAuth {...props} open />);

    rerender(<DialogLocksAuth {...props} open={false} />);
    rerender(<DialogLocksAuth {...props} open />);

    const iframe = await screen.findByTitle<HTMLIFrameElement>('Bitkit payout account setup');
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://paykit.server',
          source: iframe.contentWindow,
          data: { type: 'paykit-setup-callback', state: new URL(iframe.src).searchParams.get('state') },
        }),
      );
    });
    expect(await screen.findByText('Locks Enabled')).toBeInTheDocument();
    expect(mocks.paykitSetupStatus).toHaveBeenCalledTimes(3);

    await act(async () => previousCheck.resolve({ status: 'setup_required' }));

    expect(useLocksAuthStore.getState().selectIsPaykitConnected()).toBe(true);
    expect(screen.getByText('Locks Enabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(setupIframe()).not.toBeInTheDocument();
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
