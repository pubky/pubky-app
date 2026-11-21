import { WalletError } from '@beignet/wallet-core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bech32 } from 'bech32';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LastWalletBalance, WalletStartProgress } from '@/services/wallet/session';
import { Wallet } from './Wallet';
import { WalletAccount } from './WalletAccount';

const wallet = vi.hoisted(() => ({
  account: 'account-one',
  exists: true,
  inspect: vi.fn(),
  rememberBalance: vi.fn(),
  savedActivity: vi.fn(),
  awayReceipts: vi.fn(),
  unlocked: undefined as ((preview: LastWalletBalance | null) => void) | undefined,
  progress: undefined as ((value: WalletStartProgress) => void) | undefined,
  ringBinding: vi.fn(),
  ringDeviceId: vi.fn(),
  createRingWallet: vi.fn(),
  guardRingDevice: vi.fn(),
  ringEnrollment: vi.fn(),
  inspectRingDevice: vi.fn(),
  cancelRingHandoff: vi.fn(),
  claimRingHandoff: vi.fn(),
  importHandoff: vi.fn(),
  exportHandoff: vi.fn(),
  prepareLocalUnlock: vi.fn(),
  openWithRing: vi.fn(),
  enrollLocalUnlock: vi.fn(),
  acquireRingDevice: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  listWallets: vi.fn(),
  createWallet: vi.fn(),
  startWallet: vi.fn(),
  selectWallet: vi.fn(),
  snapshot: vi.fn(),
  prepareSend: vi.fn(),
  retrySetup: vi.fn(),
  onPrimaryChange: vi.fn<(listener: () => void) => () => void>(),
  getConfig: vi.fn(),
  loadOfflineReceiveDraft: vi.fn(),
  discardOfflineReceiveDraft: vi.fn(),
  issueOffline: vi.fn(),
  quoteMax: vi.fn(),
  prepareDrain: vi.fn(),
  cancelDrain: vi.fn(),
  send: vi.fn(),
  acknowledgePayment: vi.fn(),
  activityIncludesChannelSends: vi.fn(),
  quoteReceive: vi.fn(),
  newBitcoinAddress: vi.fn(),
  receive: vi.fn(),
  getReceiveStatus: vi.fn(),
  getRecoveryPhrase: vi.fn(),
  getRecoveryStatus: vi.fn(),
  resolveRecipient: vi.fn(),
}));

vi.mock('@/services/wallet/ring-enrollment', () => ({
  RingEnrollmentError: class extends Error {},
  ringEnrollment: wallet.ringEnrollment,
  inspectRingDevice: wallet.inspectRingDevice,
  acquireRingDevice: wallet.acquireRingDevice,
  cancelRingHandoff: wallet.cancelRingHandoff,
  claimRingHandoff: wallet.claimRingHandoff,
}));
vi.mock('./WalletKeyApproval', () => ({
  WalletKeyApproval: ({ onKey }: { onKey: (key: Uint8Array, assertCurrent: () => void) => Promise<void> }) => (
    <button onClick={() => void onKey(new Uint8Array(32), () => {})}>Approve in test Ring</button>
  ),
}));
vi.mock('@/libs/wallet/resolveRecipient', () => ({ resolveRecipient: wallet.resolveRecipient }));
vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (select: (state: { session: object; currentUserPubky: string }) => string) =>
    select({ session: {}, currentUserPubky: wallet.account }),
}));
vi.mock('@/services/wallet/session', () => ({
  WalletSession: class {
    constructor(
      _account: string,
      onUnlocked?: (preview: LastWalletBalance | null) => void,
      onStartProgress?: (value: WalletStartProgress) => void,
    ) {
      wallet.unlocked = onUnlocked;
      wallet.progress = onStartProgress;
    }
    rememberBalance = wallet.rememberBalance;
    savedActivity = wallet.savedActivity;
    onPrimaryChange = wallet.onPrimaryChange;
    awayReceipts = wallet.awayReceipts;
    loadOfflineReceiveDraft = wallet.loadOfflineReceiveDraft;
    discardOfflineReceiveDraft = wallet.discardOfflineReceiveDraft;
    receive = wallet.issueOffline;
    send = wallet.send;
    acknowledgePayment = wallet.acknowledgePayment;
    activityIncludesChannelSends = wallet.activityIncludesChannelSends;
    client = wallet;
    inspect = wallet.inspect;
    ringBinding = wallet.ringBinding;
    ringDeviceId = wallet.ringDeviceId;
    createRingWallet = wallet.createRingWallet;
    importHandoff = wallet.importHandoff;
    exportHandoff = wallet.exportHandoff;
    prepareLocalUnlock = wallet.prepareLocalUnlock;
    openWithRing = wallet.openWithRing;
    enrollLocalUnlock = wallet.enrollLocalUnlock;
    guardRingDevice = wallet.guardRingDevice;
    newBitcoinAddress = wallet.newBitcoinAddress;
    open = wallet.open;
    close = wallet.close;
  },
}));

const words = Array.from({ length: 12 }, (_, index) => 'word' + (index + 1)).join(' ');
const record = { id: 'wallet-1', name: 'Pubky wallet', network: 'regtest', status: 'running' };
const sendQuote = {
  id: 'review-1',
  destination: 'lnbcrt1destination',
  description: 'Coffee',
  route: 'lightning',
  amountSats: 3000,
  feeSats: 4,
  feeLabel: 'Fee limit',
  totalSats: 3004,
  warnings: [],
  expiresAt: 4102444800000,
};

beforeEach(() => {
  vi.resetAllMocks();
  wallet.account = 'account-one';
  wallet.exists = true;
  wallet.ringBinding.mockResolvedValue(null);
  wallet.ringEnrollment.mockResolvedValue('new');
  wallet.inspectRingDevice.mockImplementation(async () => ({ state: await wallet.ringEnrollment(), transferId: null }));
  wallet.inspect.mockImplementation(async () => ({ exists: wallet.exists }));
  wallet.open.mockResolvedValue({
    network: 'regtest',
    primaryUri: 'peer',
    electrum: { host: 'electrum.relay', port: 50001, tls: false },
  });
  wallet.close.mockResolvedValue(undefined);
  wallet.activityIncludesChannelSends.mockResolvedValue(true);
  wallet.acknowledgePayment.mockResolvedValue(undefined);
  wallet.startWallet.mockResolvedValue(undefined);
  wallet.getRecoveryStatus.mockResolvedValue({
    state: 'running',
    autoApply: { phase: 'idle' },
    channels: [],
    importComplete: false,
  });
  wallet.onPrimaryChange.mockReturnValue(() => {});
  wallet.rememberBalance.mockResolvedValue(undefined);
  wallet.savedActivity.mockResolvedValue([]);
  wallet.awayReceipts.mockResolvedValue([]);
  wallet.getConfig.mockResolvedValue({ offlineReceiveAvailable: true });
  wallet.loadOfflineReceiveDraft.mockResolvedValue(null);
  wallet.discardOfflineReceiveDraft.mockResolvedValue(undefined);
  wallet.listWallets.mockResolvedValue([record]);
  wallet.createWallet.mockResolvedValue({ ...record, mnemonic: words });
  wallet.snapshot.mockResolvedValue({
    balance: { totalSats: 5000, availableSats: 4500, pendingSats: 500 },
    primary: { connected: true },
    activity: [],
  });
  wallet.resolveRecipient.mockResolvedValue({ pubky: 'receiver', destination: 'lnbcrt1destination' });
  wallet.prepareSend.mockResolvedValue(sendQuote);
  wallet.send.mockResolvedValue({
    id: 'sent',
    amountSats: 3000,
    feeSats: 3,
    status: 'completed',
    message: 'Delivered.',
  });
});

async function unlock() {
  fireEvent.change(await screen.findByLabelText('Password', { exact: true }), {
    target: { value: 'example password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock wallet' }));
  await screen.findByRole('button', { name: /^Lock( wallet)?$/ });
}

describe('Pubky wallet', () => {
  it('requires fresh Ring approval before opening a Ring-only local vault', async () => {
    const scope = { network: 'regtest', deviceId: '2fc6e567-18a1-4861-8939-e31fa35ae477', passwordAvailable: false };
    wallet.inspect.mockResolvedValue({ exists: true, ringUnlock: scope });
    wallet.openWithRing.mockResolvedValue({ network: 'regtest' });
    render(<Wallet />);
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock with Ring' }));
    expect(wallet.openWithRing).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Password')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve in test Ring' }));
    expect(await screen.findByText('Total balance')).toBeVisible();
    expect(wallet.openWithRing).toHaveBeenCalledWith(expect.any(Uint8Array), scope, false);
    expect(wallet.open).not.toHaveBeenCalled();
  });

  it('creates a passwordless local vault before requesting a separate wallet key', async () => {
    wallet.exists = false;
    const scope = { network: 'regtest', deviceId: '2fc6e567-18a1-4861-8939-e31fa35ae477' };
    wallet.prepareLocalUnlock.mockResolvedValue(scope);
    wallet.openWithRing.mockResolvedValue({ network: 'regtest' });
    wallet.listWallets.mockResolvedValue([]);
    render(<Wallet />);
    fireEvent.click(await screen.findByRole('button', { name: 'Set up with Ring' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve in test Ring' }));
    expect(await screen.findByRole('button', { name: 'Create with Ring' })).toBeDisabled();
    expect(wallet.openWithRing).toHaveBeenCalledWith(expect.any(Uint8Array), scope, true);
    expect(wallet.createRingWallet).not.toHaveBeenCalled();
    expect(wallet.open).not.toHaveBeenCalled();
  });

  it('keeps the password route available after Ring enrollment', async () => {
    wallet.inspect.mockResolvedValue({
      exists: true,
      ringUnlock: { network: 'regtest', deviceId: 'local', passwordAvailable: true },
    });
    render(<Wallet />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use a password instead' }));
    await unlock();
    expect(await screen.findByText('Total balance')).toBeVisible();
    expect(wallet.open).toHaveBeenCalledOnce();
    expect(wallet.openWithRing).not.toHaveBeenCalled();
  });

  it('reinspects a partially created Ring credential before retrying setup', async () => {
    const scope = { network: 'regtest', deviceId: '2fc6e567-18a1-4861-8939-e31fa35ae477' };
    wallet.inspect
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValue({ exists: false, ringUnlock: { ...scope, passwordAvailable: false } });
    wallet.prepareLocalUnlock.mockResolvedValue(scope);
    wallet.openWithRing.mockRejectedValueOnce(new Error('Relay unavailable')).mockResolvedValue({ network: 'regtest' });
    render(<Wallet />);
    fireEvent.click(await screen.findByRole('button', { name: 'Set up with Ring' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve in test Ring' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock with Ring' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve in test Ring' }));
    expect(await screen.findByText('Total balance')).toBeVisible();
    expect(wallet.openWithRing.mock.calls.map((call) => call[2])).toEqual([true, false]);
    expect(wallet.prepareLocalUnlock).toHaveBeenCalledOnce();
  });

  it('offers a ready handoff before peer recovery and waits for ownership before reporting success', async () => {
    wallet.exists = false;
    wallet.listWallets.mockResolvedValue([]);
    wallet.ringDeviceId.mockResolvedValue('destination');
    const status = { state: 'handoff-ready', transferId: 'transfer', sourceDeviceId: 'source' };
    wallet.inspectRingDevice.mockResolvedValue(status);
    wallet.importHandoff.mockResolvedValue({ id: record.id, network: 'regtest', deviceId: 'destination' });
    const committed = Promise.withResolvers<void>();
    wallet.claimRingHandoff.mockImplementation(async (_account, _net, _device, _id, _lost, install) => {
      await install(Uint8Array.of(1), 'source');
      await committed.promise;
      return { release: vi.fn() };
    });
    render(<Wallet />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use a password instead' }));
    fireEvent.change(await screen.findByLabelText('New wallet password'), { target: { value: 'example password' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'example password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use wallet on this device' }));
    expect(wallet.claimRingHandoff).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve in test Ring' }));
    await waitFor(() => expect(wallet.importHandoff).toHaveBeenCalledOnce());
    expect(screen.queryByText('Wallet moved to this device')).toBeNull();
    expect(wallet.startWallet).not.toHaveBeenCalled();
    expect(wallet.createRingWallet).not.toHaveBeenCalled();
    committed.resolve();
    expect(await screen.findByText('Wallet moved to this device')).toBeVisible();
    expect(wallet.startWallet).not.toHaveBeenCalled();
  });
  it('waits for recovery evidence on a new phrase import before reading its balance', async () => {
    const initial = Promise.withResolvers<object>();
    wallet.exists = false;
    wallet.listWallets.mockResolvedValue([]);
    wallet.getRecoveryStatus.mockReturnValue(initial.promise);
    render(<Wallet />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use a password instead' }));
    fireEvent.change(await screen.findByLabelText('New wallet password'), { target: { value: 'example password' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'example password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use a recovery phrase instead' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore from phrase' }));
    fireEvent.change(screen.getByLabelText('Recovery phrase'), { target: { value: words } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Restore wallet' }));
    expect(await screen.findByText('Checking wallet recovery')).toBeVisible();
    expect(wallet.snapshot).not.toHaveBeenCalled();
    await act(async () => initial.resolve({ state: 'running', importPending: true, autoApply: { phase: 'idle' } }));
    expect(await screen.findByText('Waiting for your Lightning backup')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('keeps a payment link from requesting a quote on a fenced wallet', async () => {
    wallet.getRecoveryStatus.mockResolvedValue({ state: 'fenced' });
    render(<Wallet recipient="pubkyreceiver" />);
    await unlock();
    expect(await screen.findByText('Another device controls this wallet')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Review payment' })).toBeDisabled();
    expect(wallet.prepareSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Lock wallet' })).toBeEnabled();
  });

  it('keeps an incomplete import from displaying or saving an empty wallet and resumes with the installed balances', async () => {
    wallet.getRecoveryStatus.mockResolvedValue({
      state: 'running',
      importPending: true,
      autoApply: { phase: 'idle' },
      channels: [],
    });
    const empty = {
      wallet: record,
      primary: { connected: true },
      activity: [],
      balance: { totalSats: 0, availableSats: 0, pendingSats: 0 },
    };
    wallet.snapshot.mockResolvedValue(empty);
    render(<Wallet />);
    await unlock();
    expect(await screen.findByText('Waiting for your Lightning backup')).toBeVisible();
    expect(screen.getByText('Balance awaiting verification')).toBeVisible();
    expect(screen.queryByRole('group', { name: '₿0' })).toBeNull();
    expect(wallet.rememberBalance).not.toHaveBeenCalledWith(record.id, 'regtest', 0);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeDisabled();
    wallet.getRecoveryStatus.mockResolvedValue({
      state: 'running',
      importComplete: true,
      autoApply: { phase: 'applied' },
      channels: [{ status: 'active', restoreRecencyUnproven: true }],
    });
    wallet.snapshot.mockResolvedValue({
      ...empty,
      balance: { totalSats: 4300, availableSats: 300, pendingSats: 0 },
      notes: ['Some funds are held while the wallet verifies its latest state. Still in your total.'],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh wallet' }));
    expect(await screen.findByRole('group', { name: '₿4,300' })).toBeVisible();
    expect(screen.getByText('Restored Lightning funds are on hold')).toBeVisible();
    expect(screen.getByText('₿300')).toBeVisible();
    expect(screen.queryByText(/still in your total/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.change(screen.getByLabelText('Pay to'), { target: { value: 'lnbcrt1payment' } });
    expect(screen.getByRole('button', { name: 'Review payment' })).toBeEnabled();
  });

  it('shows the encrypted last balance during sync and replaces it with the verified total once ready', async () => {
    let finishStart!: () => void;
    wallet.startWallet.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishStart = resolve;
        }),
    );
    wallet.open.mockImplementation(async () => {
      wallet.unlocked?.({ walletId: record.id, network: 'regtest', totalSats: 4200, updatedAt: Date.UTC(2026, 0, 12) });
      return { network: 'regtest' };
    });
    wallet.snapshot.mockResolvedValue({
      wallet: record,
      balance: { totalSats: 4700, availableSats: 4700, pendingSats: 0 },
      primary: { connected: true },
      activity: [],
    });
    render(<Wallet />);
    const password = await screen.findByLabelText('Password', { exact: true });
    expect(screen.queryByText('₿4,200')).toBeNull();
    fireEvent.change(password, { target: { value: 'example password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock wallet' }));
    await screen.findByText('Connecting to Bitcoin and Lightning…');
    expect(screen.getByText('Last verified balance')).toBeVisible();
    expect(screen.getByText('₿4,200')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Refresh wallet' })).toBeDisabled();
    expect(wallet.snapshot).not.toHaveBeenCalled();
    await act(async () => finishStart());
    expect(await screen.findByRole('group', { name: '₿4,700' })).toBeVisible();
    expect(wallet.rememberBalance).toHaveBeenCalledWith(record.id, 'regtest', 4700);
    expect(screen.queryByText('Last verified balance')).toBeNull();
  });

  it('opens saved receipts and preserves a send draft while the engine connects', async () => {
    const start = Promise.withResolvers<void>();
    wallet.startWallet.mockReturnValue(start.promise);
    wallet.savedActivity.mockResolvedValue([
      {
        id: 'saved',
        kind: 'received',
        status: 'completed',
        title: 'Payment received',
        description: 'Coffee',
        reference: 'saved',
        timestamp: Date.now() - 60_000,
        amountSats: 1250,
        feeSats: 0,
      },
    ]);
    render(<Wallet />);
    await unlock();
    expect(await screen.findByRole('heading', { name: 'Saved activity' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Payment received/ }));
    const receipt = await screen.findByRole('dialog');
    expect(within(receipt).getByText('Coffee')).toBeVisible();
    fireEvent.click(within(receipt).getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const destination = screen.getByLabelText('Pay to');
    fireEvent.change(destination, { target: { value: 'lnbcrt1draft' } });
    const review = screen.getByRole<HTMLButtonElement>('button', { name: 'Review payment' });
    act(() => wallet.progress?.({ phase: 'scanning', primaryConnected: true }));
    expect(screen.getByText('Lightning connected. Syncing Bitcoin…')).toBeVisible();
    act(() => wallet.progress?.({ phase: 'finishing', primaryConnected: false }));
    expect(screen.getByText('Connecting to Lightning…')).toBeVisible();
    act(() => wallet.progress?.({ phase: 'finishing', primaryConnected: true }));
    expect(screen.getByText('Finishing wallet startup…')).toBeVisible();
    expect(review).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Max' })).toBeDisabled();
    fireEvent.submit(review.form!);
    expect(wallet.prepareSend).not.toHaveBeenCalled();
    expect(wallet.snapshot).not.toHaveBeenCalled();
    await act(async () => start.resolve());
    await waitFor(() => expect(review).toBeEnabled());
    expect(destination).toHaveValue('lnbcrt1draft');
    expect(wallet.prepareSend).not.toHaveBeenCalled();
    expect(wallet.send).not.toHaveBeenCalled();
  });

  it('keeps a receive draft through a connection failure and explicit retry', async () => {
    const first = Promise.withResolvers<void>();
    const retry = Promise.withResolvers<void>();
    wallet.startWallet.mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise);
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    const description = screen.getByLabelText('Description (optional)');
    fireEvent.change(description, { target: { value: 'Return trip' } });
    const review = screen.getByRole<HTMLButtonElement>('button', { name: 'Review request' });
    expect(review).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Receive on-chain' })).toBeDisabled();
    fireEvent.submit(review.form!);
    expect(wallet.quoteReceive).not.toHaveBeenCalled();
    expect(wallet.loadOfflineReceiveDraft).not.toHaveBeenCalled();
    expect(wallet.getConfig).not.toHaveBeenCalled();
    await act(async () => first.reject(new Error('Connection timed out.')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection timed out.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    expect(wallet.startWallet).toHaveBeenCalledTimes(2);
    expect(review).toBeDisabled();
    await act(async () => retry.resolve());
    await waitFor(() => expect(review).toBeEnabled());
    expect(description).toHaveValue('Return trip');
    expect(wallet.quoteReceive).not.toHaveBeenCalled();
    expect(wallet.receive).not.toHaveBeenCalled();
  });

  it('waits for the Ring device lease before opening the dashboard or its saved history', async () => {
    const lease = Promise.withResolvers<{ assertActive: () => void; release: () => Promise<void> }>();
    wallet.ringBinding.mockResolvedValue({ network: 'regtest', deviceId: 'own-device' });
    wallet.acquireRingDevice.mockReturnValue(lease.promise);
    render(<Wallet />);
    fireEvent.change(await screen.findByLabelText('Password', { exact: true }), {
      target: { value: 'example password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock wallet' }));
    expect(await screen.findByText('Checking device access…')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(wallet.savedActivity).not.toHaveBeenCalled();
    expect(wallet.startWallet).not.toHaveBeenCalled();
    await act(async () => lease.resolve({ assertActive: vi.fn(), release: vi.fn().mockResolvedValue(undefined) }));
    expect(await screen.findByRole('button', { name: 'Send' })).toBeEnabled();
    expect(wallet.guardRingDevice).toHaveBeenCalledOnce();
  });

  it('locks immediately and ignores a late start result', async () => {
    const start = Promise.withResolvers<void>();
    wallet.startWallet.mockReturnValue(start.promise);
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    expect(await screen.findByLabelText('Password', { exact: true })).toBeVisible();
    await act(async () => start.resolve());
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(wallet.snapshot).not.toHaveBeenCalled();
  });

  it('mounts checkout funding only after the live wallet is ready', async () => {
    const start = Promise.withResolvers<void>();
    wallet.startWallet.mockReturnValue(start.promise);
    const checkout = vi.fn(() => <button>Review funding</button>);
    render(<WalletAccount account={wallet.account} reset={vi.fn()} renderReady={checkout} />);
    fireEvent.change(await screen.findByLabelText('Password', { exact: true }), {
      target: { value: 'example password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock wallet' }));
    expect(await screen.findByText('Connecting to Bitcoin and Lightning…')).toBeVisible();
    expect(checkout).not.toHaveBeenCalled();
    await act(async () => start.resolve());
    expect(await screen.findByRole('button', { name: 'Review funding' })).toBeVisible();
  });

  it('shows a single spendable balance without the unconfirmed channel funding notice', async () => {
    wallet.snapshot.mockResolvedValue({
      balance: { totalSats: 5000, availableSats: 5000, pendingSats: 0 },
      primary: { connected: true },
      activity: [],
      notes: [
        '5,000 sats are in a transfer that has not confirmed yet. You can send now. Bitcoin address payments complete after confirmation.',
      ],
    });
    render(<Wallet />);
    await unlock();
    expect(await screen.findByText('₿5,000')).toBeVisible();
    expect(screen.queryByText('Available to send')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    expect(screen.queryByText(/Bitcoin address payments complete after confirmation/)).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the spendable amount and channel hold when only part of the balance can be sent', async () => {
    wallet.snapshot.mockResolvedValue({
      balance: { totalSats: 5000, availableSats: 4200, pendingSats: 0 },
      primary: { connected: true },
      activity: [],
    });
    render(<Wallet />);
    await unlock();
    expect(await screen.findByText('Unavailable in channels')).toBeVisible();
    expect(screen.getByText('₿800')).toBeVisible();
    expect(screen.getByText('₿4,200')).toBeVisible();
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
  });

  it('creates a wallet only after the password step and presents its recovery phrase before start', async () => {
    wallet.exists = false;
    wallet.listWallets.mockResolvedValue([]);
    render(<Wallet />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use a password instead' }));
    fireEvent.change(await screen.findByLabelText('New wallet password'), { target: { value: 'example password' } });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'example password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use a recovery phrase instead' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create with recovery phrase' }));
    expect(await screen.findByText('word12')).toBeInTheDocument();
    expect(wallet.createWallet).toHaveBeenCalledTimes(1);
    expect(wallet.startWallet).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'I saved my words' }));
    expect(await screen.findByText('Total balance')).toBeInTheDocument();
    expect(screen.queryByText('word12')).not.toBeInTheDocument();
  });

  it.each([
    ['new', 'Create with Ring', 'create'],
    ['other-device', 'Recover with Ring', 'restore'],
  ] as const)(
    'opens a %s Ring wallet after explicit approval without a recovery phrase',
    async (state, button, mode) => {
      wallet.exists = false;
      wallet.listWallets.mockResolvedValue([]);
      wallet.ringEnrollment.mockResolvedValue(state);
      wallet.ringDeviceId.mockResolvedValue('local-device');
      const held = { mode, assertActive: vi.fn(), release: vi.fn() };
      wallet.acquireRingDevice.mockResolvedValue(held);
      wallet.createRingWallet.mockImplementation(async () => {
        wallet.ringBinding.mockResolvedValue({ deviceId: 'local-device', network: 'regtest' });
        return record;
      });
      render(<Wallet />);
      fireEvent.click(await screen.findByRole('button', { name: 'Use a password instead' }));
      fireEvent.change(await screen.findByLabelText('New wallet password'), { target: { value: 'example password' } });
      fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'example password' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.queryByRole('button', { name: 'Create with recovery phrase' })).toBeNull();
      if (mode === 'restore')
        fireEvent.click(await screen.findByRole('button', { name: 'I lost access to that device' }));
      expect(await screen.findByRole('button', { name: button })).toBeDisabled();
      if (mode === 'restore') expect(screen.queryByRole('button', { name: 'Create with Ring' })).toBeNull();
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: button }));
      expect(wallet.createRingWallet).not.toHaveBeenCalled();
      fireEvent.click(await screen.findByRole('button', { name: 'Approve in test Ring' }));
      expect(await screen.findByText('Total balance')).toBeVisible();
      expect(wallet.createRingWallet).toHaveBeenCalledWith(expect.any(Uint8Array), 'regtest', mode);
      expect(wallet.guardRingDevice).toHaveBeenCalledWith(held.assertActive);
      expect(wallet.createWallet).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Back up wallet' }));
      expect(await screen.findByText('Pubky Ring recovery')).toBeVisible();
      expect(wallet.getRecoveryPhrase).not.toHaveBeenCalled();
    },
  );

  it('requires a separate confirmation of the recipient, fee and network quote, and sends once', async () => {
    render(<Wallet recipient="pubkyreceiver" />);
    await unlock();
    expect(screen.getByLabelText('Pay to')).toHaveValue('pubkyreceiver');
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    expect(await screen.findByText('receiver')).toBeVisible();
    const rawInvoice = screen.getByLabelText('Lightning invoice');
    expect(rawInvoice).not.toBeVisible();
    fireEvent.click(screen.getByText('View Lightning invoice'));
    expect(rawInvoice).toBeVisible();
    expect(rawInvoice).toHaveValue('lnbcrt1destination');
    fireEvent.click(screen.getByText('View Lightning invoice'));
    expect(screen.getByText('₿3,004')).toBeVisible();
    expect(wallet.send).not.toHaveBeenCalled();
    const submit = screen.getByRole('button', { name: 'Confirm payment' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(await screen.findByText('Payment sent')).toBeVisible();
    expect(wallet.send).toHaveBeenCalledWith(sendQuote);
    expect(wallet.send).toHaveBeenCalledTimes(1);
  });

  it('quotes Max for the recipient, binds the review, and displays the exact paid Lightning fee', async () => {
    wallet.quoteMax.mockResolvedValue({ amountSats: 4980, keptSats: 0, keptReason: 'none' });
    wallet.prepareSend.mockResolvedValue({
      ...sendQuote,
      max: true,
      minRecipientSats: 4980,
      feeSats: 20,
      feeLabel: 'Maximum routing fee',
      maxFeeMsat: '20000',
      debitMsat: '5000000',
      amountSats: 4980,
      totalSats: 5000,
      keptSats: 0,
    });
    wallet.send.mockResolvedValue({
      status: 'completed',
      amountSats: 4998,
      feeSats: 2,
      message: 'Delivered.',
      feeKnown: true,
      payAll: {
        debitMsat: '5000000',
        deliveredMsat: '4998625',
        feeMsat: '1375',
        remainderMsat: '0',
        maxFeeMsat: '20000',
      },
    });
    render(<Wallet recipient="receiver" />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    expect(await screen.findByText(/Maximum quoted for this destination/)).toBeVisible();
    expect(screen.getByLabelText('Amount in bitcoin (optional)')).toHaveValue('4980');
    expect(wallet.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    expect(await screen.findByText('Recipient gets at least')).toBeVisible();
    expect(screen.getByText('₿4,980')).toBeVisible();
    expect(wallet.prepareSend).toHaveBeenCalledWith({ request: 'lnbcrt1destination', max: true });
    expect(wallet.resolveRecipient).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }));
    expect(await screen.findByText('₿4,998 + 625 msat')).toBeVisible();
    expect(screen.getByText('₿1 + 375 msat')).toBeVisible();
  });

  it('clears the Max quote when the destination or amount changes', async () => {
    wallet.quoteMax.mockResolvedValue({ amountSats: 4980, keptSats: 0, keptReason: 'none' });
    render(<Wallet recipient="first" />);
    await unlock();
    const max = screen.getByRole('button', { name: 'Max' });
    fireEvent.click(max);
    await screen.findByText(/Maximum quoted/);
    fireEvent.change(screen.getByLabelText('Pay to'), { target: { value: 'second' } });
    expect(max).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Amount in bitcoin (optional)')).toHaveValue('');
    fireEvent.click(max);
    await screen.findByText(/Maximum quoted/);
    fireEvent.change(screen.getByLabelText('Amount in bitcoin (optional)'), { target: { value: '1200' } });
    expect(max).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    await screen.findByRole('button', { name: 'Confirm payment' });
    expect(wallet.prepareSend).toHaveBeenCalledWith({ request: 'lnbcrt1destination', amountSats: '1200' });
  });

  it('requires explicit channel-close review and releases the drain quote when editing', async () => {
    const address = bech32.encode('bcrt', [0, ...bech32.toWords(new Uint8Array(20))]);
    wallet.resolveRecipient.mockResolvedValue({ destination: address });
    wallet.quoteMax.mockResolvedValue({ amountSats: 3800, keptSats: 1000, keptReason: 'reserve' });
    wallet.prepareDrain.mockResolvedValue({
      ...sendQuote,
      method: 'drain',
      route: 'bitcoin',
      amountSats: 4500,
      totalSats: 5000,
      feeSats: 500,
      feeLabel: 'Estimated network fees',
      destination: address,
      drain: { closeFeeSats: 300, sweepFeeSats: 200 },
      warnings: ['Your home channel closes.'],
    });
    render(<Wallet recipient={address} />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('₿1,000');
    expect(wallet.prepareDrain).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Empty wallet to this address' }));
    expect(await screen.findByText('Estimated channel closing fee')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm wallet drain' })).toBeVisible();
    expect(wallet.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await screen.findByRole('button', { name: 'Empty wallet to this address' });
    expect(wallet.cancelDrain).toHaveBeenCalledWith('review-1');
  });

  it.each(['INVALID_REVIEW', 'REVIEW_CHANGED'])(
    'requests a fresh review after the wallet rejects a quote with %s',
    async (code) => {
      wallet.send.mockRejectedValueOnce(new WalletError('Review this payment again before sending.', code));
      render(<Wallet recipient="pubkyreceiver" />);
      await unlock();
      fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm payment' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Review this payment again before sending.');
      expect(screen.queryByText('Payment status unknown')).toBeNull();
      expect(screen.getByLabelText('Pay to')).toHaveValue('pubkyreceiver');
      fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
      expect(await screen.findByRole('button', { name: 'Confirm payment' })).toBeVisible();
      expect(wallet.prepareSend).toHaveBeenCalledTimes(2);
      expect(wallet.send).toHaveBeenCalledTimes(1);
    },
  );

  it('never retries a send whose outcome is unknown', async () => {
    wallet.send.mockRejectedValue(new Error('The connection closed.'));
    render(<Wallet recipient="pubkyreceiver" />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm payment' }));
    expect(await screen.findByText('Payment status unknown')).toBeVisible();
    expect(screen.getByText('Check Activity before trying another payment.')).toBeVisible();
    expect(wallet.send).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Confirm payment' })).toBeNull();
  });

  it.each(['Send', 'Receive'])('opens a focused %s screen and restores keyboard focus on return', async (action) => {
    render(<Wallet />);
    await unlock();
    expect(screen.queryByText('Lightning connected')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: action }));
    const back = await screen.findByRole('button', { name: 'Back to wallet' });
    expect(back).toHaveFocus();
    expect(screen.queryByRole('heading', { name: 'Activity' })).toBeNull();
    expect(screen.getByRole('button', { name: action === 'Send' ? 'Review payment' : 'Review request' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Lock wallet' })).toBeVisible();
    fireEvent.click(back);
    expect(await screen.findByRole('heading', { name: 'Activity' })).toBeVisible();
    expect(screen.getByRole('button', { name: action })).toHaveFocus();
  });

  const genericSetupError =
    'Primary setup could not complete. Check the node address and connection settings, then retry setup.';

  it('updates Receive as soon as a pending primary connects without claiming setup failed', async () => {
    const base = {
      wallet: record,
      balance: { totalSats: 0, availableSats: 0, offlineReceivableSats: 5000, pendingSats: 0 },
      activity: [],
    };
    wallet.snapshot.mockResolvedValue({
      ...base,
      primary: { connected: false, setup: 'pending', setupError: genericSetupError },
      notes: ['Wallet setup is not finished. Check Settings.'],
    });
    const unsubscribe = vi.fn();
    wallet.onPrimaryChange.mockReturnValue(unsubscribe);
    const view = render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    expect(await screen.findByText('Connecting to Lightning…')).toBeVisible();
    expect(
      screen.queryByText(
        /setup is incomplete|needs attention|Primary setup could not complete|Lightning disconnected/i,
      ),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Receive offline' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Amount in bitcoin/), { target: { value: '1000' } });
    wallet.snapshot.mockResolvedValue({
      ...base,
      primary: { connected: true, setup: 'ready', offlineReceiveAvailable: true },
    });
    act(() => wallet.onPrimaryChange.mock.calls[0][0]());
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Receive offline' })).toBeEnabled());
    expect(screen.queryByText('Connecting to Lightning…')).toBeNull();
    expect(screen.getByLabelText(/Amount in bitcoin/)).toHaveValue('1000');
    expect(wallet.retrySetup).not.toHaveBeenCalled();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('rechecks a peer event that arrived while the first snapshot was reading', async () => {
    const base = { wallet: record, balance: { totalSats: 0, availableSats: 0, pendingSats: 0 }, activity: [] };
    let finishFirst!: () => void;
    wallet.snapshot
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = () => resolve({ ...base, primary: { connected: false, setup: 'pending' } });
          }),
      )
      .mockResolvedValue({ ...base, primary: { connected: true, setup: 'ready' } });
    render(<Wallet />);
    await unlock();
    await waitFor(() => expect(wallet.snapshot).toHaveBeenCalledTimes(1));
    act(() => {
      const hint = wallet.onPrimaryChange.mock.calls[0][0];
      hint();
      hint();
    });
    expect(wallet.snapshot).toHaveBeenCalledTimes(1);
    await act(async () => finishFirst());
    await waitFor(() => expect(wallet.snapshot).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Connecting to Lightning…')).toBeNull());
    expect(wallet.retrySetup).not.toHaveBeenCalled();
  });

  it('quickly notices a recovered primary when the peer event was missed', async () => {
    const base = { wallet: record, balance: { totalSats: 0, availableSats: 0, pendingSats: 0 }, activity: [] };
    wallet.snapshot.mockResolvedValue({ ...base, primary: { connected: false, setup: 'ready' } });
    render(<Wallet />);
    await unlock();
    expect(await screen.findByText('Connecting to Lightning…')).toBeVisible();
    wallet.listWallets.mockResolvedValue([{ ...record, lfbw: { setup: 'ready', primaries: [{ connected: true }] } }]);
    wallet.snapshot.mockResolvedValue({ ...base, primary: { connected: true, setup: 'ready' } });
    await waitFor(() => expect(screen.queryByText('Connecting to Lightning…')).toBeNull(), { timeout: 3500 });
    expect(wallet.snapshot).toHaveBeenCalledTimes(2);
    expect(wallet.retrySetup).not.toHaveBeenCalled();
  });

  it.each([
    genericSetupError,
    'The primary node connection timed out. Check the address, port, and network, then retry setup.',
  ])('allows the first automatic redial, then offers Reconnect if the transport still fails: %s', async (error) => {
    const timer = vi.spyOn(window, 'setTimeout');
    try {
      wallet.snapshot.mockResolvedValue({
        wallet: record,
        balance: { totalSats: 0, availableSats: 0, pendingSats: 0 },
        activity: [],
        primary: { connected: false, setup: 'failed', setupError: error },
        notes: ['Wallet setup is not finished. Check Settings.'],
      });
      render(<Wallet />);
      await unlock();
      expect(await screen.findByText('Connecting to Lightning…')).toBeVisible();
      expect(screen.queryByText(error)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
      const grace = timer.mock.calls.find(([, delay]) => delay !== undefined && delay > 19_000 && delay <= 20_000)?.[0];
      expect(typeof grace).toBe('function');
      act(() => {
        if (typeof grace === 'function') grace();
      });
      expect(screen.getByText(error)).toBeVisible();
      expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
    } finally {
      timer.mockRestore();
    }
  });

  it('shows the actionable reason when the primary reports a failed setup', async () => {
    wallet.snapshot.mockResolvedValue({
      wallet: record,
      balance: { totalSats: 0, availableSats: 0, pendingSats: 0 },
      activity: [],
      primary: { connected: false, setup: 'failed', setupError: 'The connection could not be authenticated.' },
      notes: ['Wallet setup is not finished. Check Settings.'],
    });
    render(<Wallet />);
    await unlock();
    expect(await screen.findByText('Lightning connection failed')).toBeVisible();
    expect(screen.getByText('The connection could not be authenticated.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
    expect(screen.queryByText(/setup is incomplete/i)).toBeNull();
  });

  it('keeps reconnect within reach when Lightning goes offline during a payment flow', async () => {
    const snapshot = { wallet: record, balance: { totalSats: 0, availableSats: 0, pendingSats: 0 }, activity: [] };
    wallet.snapshot.mockResolvedValue({ ...snapshot, primary: { connected: true, setup: 'ready' } });
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    await screen.findByText('Accept a Lightning payment while your wallet is closed.');
    wallet.snapshot.mockResolvedValue({ ...snapshot, primary: { connected: false, setup: 'ready' } });
    act(() => wallet.onPrimaryChange.mock.calls[0][0]());
    expect(await screen.findByText('Lightning disconnected')).toBeVisible();
    wallet.snapshot.mockResolvedValue({ ...snapshot, primary: { connected: true, setup: 'ready' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull());
    expect(wallet.retrySetup).toHaveBeenCalledOnce();
    expect(screen.queryByText('Lightning connected')).toBeNull();
  });

  it('offers a watched on-chain deposit without asking the primary for inbound liquidity', async () => {
    const address = 'bcrt1qkgfgyxyqhvkdqh04sklnzxphmcds6vft6y7h0r';
    wallet.newBitcoinAddress.mockResolvedValue(address);
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.change(screen.getByLabelText(/Amount in bitcoin/), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Receive on-chain' }));
    expect(await screen.findByText(address)).toBeInTheDocument();
    expect(screen.getByTitle('Bitcoin deposit QR code')).toBeInTheDocument();
    expect(wallet.newBitcoinAddress).toHaveBeenCalledWith('regtest');
    expect(wallet.quoteReceive).not.toHaveBeenCalled();
    expect(wallet.receive).not.toHaveBeenCalled();
  });

  it('reviews a fixed offline fee and only says the wallet can close after the invoice is saved', async () => {
    const quote = {
      id: 'offline-receive-1234',
      mode: 'offline',
      amountSats: 354,
      feeSats: 4,
      netSats: 350,
      description: 'Coffee',
      expiresAt: Date.now() + 60_000,
      warnings: [],
    };
    const request = {
      ...quote,
      offlineReceive: true,
      bolt11: 'lnbcrt1offline',
      uri: 'bitcoin:test?lightning=lnbcrt1offline',
      paymentHash: 'abc',
    };
    let finishSaving!: (saved: typeof request) => void;
    wallet.snapshot.mockResolvedValue({
      balance: { totalSats: 5000, availableSats: 5000, offlineReceivableSats: 2000 },
      primary: { connected: true, offlineReceiveAvailable: true },
      activity: [],
    });
    wallet.quoteReceive.mockResolvedValue(quote);
    wallet.issueOffline.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSaving = resolve;
        }),
    );
    wallet.getReceiveStatus.mockResolvedValue({ phase: 'waiting' });
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    const toggle = await screen.findByRole('switch', { name: 'Receive offline' });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(screen.queryByRole('button', { name: 'Let sender choose' })).toBeNull();
    expect(screen.getByText(/Enter ₿354 to ₿2,000/)).toBeVisible();
    const review = screen.getByRole('button', { name: 'Review request' });
    const amount = screen.getByLabelText(/Amount in bitcoin/);
    for (const value of ['', '0', '353', '2001']) {
      fireEvent.change(amount, { target: { value } });
      expect(review).toBeDisabled();
    }
    expect(wallet.quoteReceive).not.toHaveBeenCalled();
    fireEvent.change(amount, { target: { value: '354' } });
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: 'Coffee' } });
    fireEvent.click(review);
    expect(await screen.findByText('Offline Lightning invoice')).toBeVisible();
    expect(wallet.quoteReceive).toHaveBeenCalledWith({ mode: 'offline', amountSats: 354, description: 'Coffee' });
    expect(screen.getByText('Receive fee').nextElementSibling).toHaveTextContent('₿4');
    expect(screen.getByText('You receive').nextElementSibling).toHaveTextContent('₿350');
    fireEvent.click(screen.getByRole('button', { name: 'Create request' }));
    expect(wallet.issueOffline).toHaveBeenCalledWith(quote);
    expect(screen.queryByText(/You can close your wallet/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy request' })).toBeNull();
    await act(async () => finishSaving(request));
    expect(await screen.findByText(/You can close your wallet/)).toBeVisible();
    expect(screen.queryByText(/Keep your wallet open/)).toBeNull();
    expect(screen.getByText('₿354')).toBeVisible();
    expect(screen.getByLabelText('Lightning invoice')).toHaveValue(request.bolt11);
    expect(screen.queryByRole('button', { name: 'Unified request' })).toBeNull();
    expect(wallet.receive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'New request' }));
    expect(await screen.findByRole('switch', { name: 'Receive offline' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Review request' })).toBeEnabled();
  });

  it('resumes an interrupted offline request at its original primary even when its capacity is reserved', async () => {
    const draft = { id: 'offline-receive-1234', amountSats: 1200, description: 'Lunch', peer: 'peer' };
    wallet.loadOfflineReceiveDraft.mockResolvedValue(draft);
    wallet.snapshot.mockResolvedValue({
      balance: { totalSats: 0, availableSats: 0, offlineReceivableSats: 0 },
      primary: { connected: true },
      activity: [],
    });
    wallet.quoteReceive.mockResolvedValue({
      ...draft,
      mode: 'offline',
      feeSats: 10,
      netSats: 1190,
      expiresAt: Date.now() + 60_000,
      warnings: [],
    });
    wallet.issueOffline.mockRejectedValue(new Error('The primary did not respond.'));
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Resume offline request' }));
    const expected = { mode: 'offline', requestId: draft.id, peer: draft.peer, amountSats: 1200, description: 'Lunch' };
    expect(wallet.quoteReceive).toHaveBeenLastCalledWith(expected);
    fireEvent.click(await screen.findByRole('button', { name: 'Create request' }));
    expect(await screen.findByText('The primary did not respond.')).toBeVisible();
    expect(screen.queryByText(/You can close your wallet/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume offline request' }));
    expect(await screen.findByRole('button', { name: 'Create request' })).toBeEnabled();
    expect(wallet.quoteReceive).toHaveBeenCalledTimes(2);
    expect(wallet.quoteReceive).toHaveBeenLastCalledWith(expected);
    expect(wallet.receive).not.toHaveBeenCalled();
    expect(wallet.discardOfflineReceiveDraft).not.toHaveBeenCalled();
  });

  it.each([
    { available: false, capacity: 1000, reason: /primary does not offer offline/ },
    { available: true, capacity: 0, reason: /no room for an offline payment/ },
  ])(
    'keeps ordinary Lightning available when offline support is $available and capacity is $capacity',
    async ({ available, capacity, reason }) => {
      wallet.snapshot.mockResolvedValue({
        balance: { totalSats: 0, availableSats: 0, offlineReceivableSats: capacity },
        primary: { connected: true, offlineReceiveAvailable: available },
        activity: [],
      });
      render(<Wallet />);
      await unlock();
      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      const hint = await screen.findByText(reason);
      expect(hint).toBeVisible();
      expect(screen.getByRole('switch', { name: 'Receive offline' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Review request' })).toBeEnabled();
      fireEvent.change(screen.getByLabelText(/Amount in bitcoin/), { target: { value: '1' } });
      expect(screen.getByRole('button', { name: 'Review request' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Receive on-chain' })).toBeEnabled();
    },
  );

  it('shows the receive fee before creating the request, then tracks the invoice', async () => {
    const quote = {
      id: 'q',
      amountSats: 8000,
      netSats: 7890,
      feeSats: 110,
      description: 'test',
      warnings: [],
      expiresAt: 4102444800000,
    };
    const request = {
      id: 'r',
      uri: 'bitcoin:test?lightning=lnbcrt1test',
      bolt11: 'lnbcrt1test',
      expiresAt: Date.now() + 30000,
      warnings: [],
    };
    wallet.quoteReceive.mockResolvedValue(quote);
    wallet.receive.mockResolvedValue(request);
    wallet.getReceiveStatus.mockResolvedValue({ phase: 'waiting' });
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.change(screen.getByLabelText(/Amount in bitcoin/), { target: { value: '8000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review request' }));
    expect(await screen.findByText('₿110')).toBeVisible();
    expect(wallet.receive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Create request' }));
    const rawInvoice = await screen.findByLabelText('Lightning invoice');
    expect(rawInvoice).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Copy request' })).toBeVisible();
    fireEvent.click(screen.getByText('View Lightning invoice'));
    expect(rawInvoice).toBeVisible();
    expect(rawInvoice).toHaveValue(request.bolt11);
    expect(wallet.receive).toHaveBeenCalledWith(quote);
    await waitFor(() => expect(wallet.getReceiveStatus).toHaveBeenCalledWith(request));
    fireEvent.click(screen.getByRole('button', { name: 'Unified request' }));
    expect(screen.getByLabelText('Payment request')).toHaveValue(request.uri);
  });

  it('rejects malformed or out-of-range amounts and quotes a positive fixed amount', async () => {
    const user = userEvent.setup();
    wallet.quoteReceive.mockResolvedValue({ id: 'fixed', amountSats: 1, netSats: 1, feeSats: 0, warnings: [] });
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    const amount = screen.getByRole('textbox', { name: /Amount in bitcoin/ });
    const review = screen.getByRole<HTMLButtonElement>('button', { name: 'Review request' });
    const form = review.form!;
    for (const value of [' ', '-1', '1.5', '1e3', '2100000000000001', '9007199254740992']) {
      fireEvent.change(amount, { target: { value } });
      expect(review).toBeDisabled();
      fireEvent.submit(form);
    }
    expect(wallet.quoteReceive).not.toHaveBeenCalled();
    expect(wallet.receive).not.toHaveBeenCalled();
    fireEvent.change(amount, { target: { value: '1' } });
    expect(review).toBeEnabled();
    await user.click(review);
    expect(await screen.findByText('You receive')).toBeVisible();
    expect(wallet.quoteReceive).toHaveBeenCalledTimes(1);
    expect(wallet.quoteReceive).toHaveBeenCalledWith({ amountSats: 1, description: '' });
    expect(wallet.receive).not.toHaveBeenCalled();
  });

  it.each(['', '0', '000'])('reviews a sender-chosen first Lightning invoice for amount "%s"', async (input) => {
    const user = userEvent.setup();
    wallet.snapshot.mockResolvedValue({
      wallet: record,
      balance: { totalSats: 0, availableSats: 0, pendingSats: 0, receivableSats: 0 },
      primary: { connected: true, setup: 'ready' },
      activity: [],
    });
    const quote = {
      id: 'first',
      amountSats: null,
      feeSats: 0,
      netSats: null,
      warnings: [],
      jitFee: { flatFeeSats: 0, feePpm: 0, maxFeeSats: 0, maxReceivableSats: 50000 },
    };
    wallet.quoteReceive.mockResolvedValue(quote);
    wallet.receive.mockResolvedValue({
      id: 'open',
      amountSats: null,
      feeSats: 0,
      uri: 'bitcoin:test?lightning=lnbcrt1example',
      bolt11: 'lnbcrt1example',
      expiresAt: Date.now() + 60000,
      warnings: ['The sender can pay up to 50,000 sats over Lightning.'],
    });
    wallet.getReceiveStatus.mockResolvedValue({ phase: 'waiting' });
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    const amount = screen.getByRole('textbox', { name: /Amount in bitcoin/ });
    const review = screen.getByRole('button', { name: 'Review request' });
    expect(screen.queryByRole('button', { name: 'Let sender choose' })).toBeNull();
    if (input) await user.type(amount, input);
    expect(review).toBeEnabled();
    expect(wallet.quoteReceive).not.toHaveBeenCalled();
    if (input) await user.click(review);
    else {
      await user.click(amount);
      await user.keyboard('{Enter}');
    }
    expect(await screen.findByText('Sender chooses')).toBeVisible();
    expect(wallet.quoteReceive).toHaveBeenCalledWith({ amountSats: undefined, description: '' });
    expect(screen.getByText('Receive fee').nextElementSibling).toHaveTextContent('₿0');
    expect(screen.getByText('Lightning payment limit').nextElementSibling).toHaveTextContent('₿50,000');
    expect(screen.queryByText('You receive')).toBeNull();
    expect(wallet.receive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Create request' }));
    expect(await screen.findByLabelText('Lightning invoice')).toHaveValue('lnbcrt1example');
    expect(screen.getByText('The sender can pay up to ₿50,000 over Lightning.')).toBeVisible();
    expect(wallet.receive).toHaveBeenCalledWith(quote);
  });

  it('reviews the fee policy and upper bound before a sender-chosen payment', async () => {
    wallet.quoteReceive.mockResolvedValue({
      id: 'variable',
      amountSats: null,
      netSats: null,
      feeSats: 2520,
      warnings: [],
      jitFee: { flatFeeSats: 20, feePpm: 2500, maxFeeSats: 2520, maxReceivableSats: 1000000 },
    });
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review request' }));
    expect(await screen.findByText('₿20 + 0.25% of the payment')).toBeVisible();
    expect(screen.getByText('Maximum receive fee').nextElementSibling).toHaveTextContent('₿2,520');
    expect(screen.queryByText('You receive')).toBeNull();
    expect(screen.queryByText('Receive fee')).toBeNull();
    expect(wallet.receive).not.toHaveBeenCalled();
  });

  it('keeps the receive form editable when the primary can only quote a smaller fixed amount', async () => {
    wallet.quoteReceive
      .mockRejectedValueOnce(
        new WalletError(
          'The primary cannot fund this request. Enter a fixed amount and try again.',
          'RECEIVE_UNAVAILABLE',
        ),
      )
      .mockResolvedValueOnce({ id: 'fixed', amountSats: 1200, netSats: 1200, feeSats: 0, warnings: [] });
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: 'Coffee' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a fixed amount and try again.');
    fireEvent.change(screen.getByLabelText(/Amount in bitcoin/), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review request' }));
    expect(await screen.findByText('You receive')).toBeVisible();
    expect(wallet.quoteReceive).toHaveBeenLastCalledWith({ amountSats: 1200, description: 'Coffee' });
    expect(wallet.receive).not.toHaveBeenCalled();
  });

  it('explains a primary that requires an amount and keeps the invoice draft available for a fixed quote', async () => {
    const legacy = 'Enter an amount so your primary node can quote the receive fee.';
    wallet.quoteReceive
      .mockRejectedValueOnce(new WalletError(legacy, 'AMOUNT_REQUIRED'))
      .mockResolvedValueOnce({ id: 'fixed', amountSats: 600, netSats: 600, feeSats: 0, warnings: [] });
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: 'Coffee' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review request' }));
    const hint = await screen.findByText('Enter an amount for a Lightning request with this primary.');
    expect(hint).toBeVisible();
    expect(screen.queryByText(legacy)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Let sender choose' })).toBeNull();
    const review = screen.getByRole<HTMLButtonElement>('button', { name: 'Review request' });
    const amount = screen.getByLabelText(/Amount in bitcoin/);
    expect(review).toBeDisabled();
    fireEvent.change(amount, { target: { value: '00' } });
    expect(review).toBeDisabled();
    fireEvent.submit(review.form!);
    expect(wallet.quoteReceive).toHaveBeenCalledTimes(1);
    fireEvent.change(amount, { target: { value: '600' } });
    expect(review).toBeEnabled();
    fireEvent.click(review);
    await screen.findByText('You receive');
    expect(wallet.quoteReceive).toHaveBeenLastCalledWith({ amountSats: 600, description: 'Coffee' });
    expect(wallet.receive).not.toHaveBeenCalled();
  });

  it.each(['', '00'])('makes an on-chain request without a fixed amount for input "%s"', async (input) => {
    const user = userEvent.setup();
    const address = 'bcrt1qkgfgyxyqhvkdqh04sklnzxphmcds6vft6y7h0r';
    wallet.newBitcoinAddress.mockResolvedValue(address);
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.change(screen.getByLabelText(/Amount in bitcoin/), { target: { value: input } });
    fireEvent.click(screen.getByRole('button', { name: 'Receive on-chain' }));
    await user.click(await screen.findByRole('button', { name: 'Copy Bitcoin request' }));
    await expect(navigator.clipboard.readText()).resolves.toBe(address);
    expect(screen.queryByText('Requested amount')).toBeNull();
    expect(wallet.quoteReceive).not.toHaveBeenCalled();
  });

  it('keeps the Activity row, amount and open receipt in place when a submission settles', async () => {
    const paymentHash = 'fe'.repeat(32);
    const pending = {
      id: 'submission:first',
      kind: 'sent',
      title: 'Payment sent',
      description: 'Coffee',
      status: 'pending',
      timestamp: Date.UTC(2026, 0, 12),
      reference: paymentHash,
      paymentHash,
      amountSats: 1250,
      feeSats: 2,
      feeKnown: true,
    };
    const snapshot = {
      wallet: record,
      balance: { totalSats: 5000, availableSats: 5000, pendingSats: 0 },
      primary: { connected: true },
    };
    const newer = {
      ...pending,
      id: 'another',
      reference: 'another',
      paymentHash: '00'.repeat(32),
      status: 'completed',
      amountSats: 40,
      timestamp: pending.timestamp + 1,
    };
    wallet.snapshot.mockResolvedValue({ ...snapshot, activity: [newer, pending] });
    render(<Wallet />);
    await unlock();
    const trigger = await screen.findByRole('button', { name: /₿1,250.*pending/i });
    const list = screen.getByRole('list');
    expect(list.lastElementChild).toContainElement(trigger);
    const amount = within(trigger).getByText('−₿1,250');
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Payment receipt' });
    expect(within(dialog).getByText('Coffee')).toBeVisible();
    wallet.snapshot.mockResolvedValue({
      ...snapshot,
      activity: [
        { ...pending, id: `payment:${paymentHash}`, status: 'completed', timestamp: newer.timestamp + 1 },
        newer,
      ],
    });
    // TanStack rechecks the wallet when the tab becomes visible, including while a receipt is open.
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(within(trigger).getByText('completed')).toBeInTheDocument(), { timeout: 6000 });
    expect(list.lastElementChild).toContainElement(trigger);
    expect(list.children).toHaveLength(2);
    expect(within(trigger).getByText('−₿1,250')).toBe(amount);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(within(dialog).getByText('Payment sent')).toBeVisible();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: /₿1,250.*completed/i })).toBe(trigger);
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(within(await screen.findByRole('dialog')).getByText('Coffee')).toBeVisible();
  });

  it('keeps separate attempts for the same invoice attached to their own receipts', async () => {
    const hash = 'ba'.repeat(32);
    const first = {
      id: 'submission:first',
      reference: hash,
      paymentHash: hash,
      kind: 'sent',
      title: 'Payment declined',
      description: 'First attempt',
      status: 'failed',
      amountSats: 120,
      feeSats: 0,
      timestamp: 1000,
    };
    const retry = {
      ...first,
      id: 'submission:retry',
      title: 'Payment sent',
      description: 'Second attempt',
      status: 'pending',
      timestamp: 2000,
    };
    const snapshot = {
      wallet: record,
      primary: { connected: true },
      balance: { totalSats: 300, availableSats: 300, pendingSats: 0 },
    };
    wallet.snapshot.mockResolvedValue({ ...snapshot, activity: [retry, first] });
    render(<Wallet />);
    await unlock();
    const declined = await screen.findByRole('button', { name: /₿120.*failed/i });
    const paying = screen.getByRole('button', { name: /₿120.*pending/i });
    fireEvent.click(declined);
    const dialog = await screen.findByRole('dialog');
    wallet.snapshot.mockResolvedValue({
      ...snapshot,
      activity: [{ ...retry, id: `payment:${hash}`, status: 'completed' }, first],
    });
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(screen.getByText('completed')).toBeInTheDocument(), { timeout: 6000 });
    expect(within(dialog).getByText('First attempt')).toBeVisible();
    expect(within(dialog).getByText('Payment failed')).toBeVisible();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: /₿120.*failed/i })).toBe(declined);
    expect(screen.getByRole('button', { name: /₿120.*completed/i })).toBe(paying);
    fireEvent.click(paying);
    expect(within(await screen.findByRole('dialog')).getByText('Second attempt')).toBeVisible();
  });

  it('shows verified away context in the matching incoming row and its receipt', async () => {
    const paymentHash = 'ab'.repeat(32);
    const incoming = {
      id: `payment:${paymentHash}`,
      kind: 'received',
      title: 'Payment received',
      description: 'Dinner',
      status: 'completed',
      timestamp: Date.UTC(2026, 0, 12),
      reference: paymentHash,
      paymentHash,
      amountSats: 850,
      feeSats: 0,
    };
    const otherHash = 'cd'.repeat(32);
    const activity = [
      {
        ...incoming,
        address: 'bcrt1fallback',
        receiveRequest: { offlineReceive: true, address: 'bcrt1fallback', amountSats: 850 },
        receiveStatus: {
          method: 'lightning',
          phase: 'completed',
          receivedSats: 850,
          confirmedSats: 850,
          pendingSats: 0,
          txids: [],
        },
      },
      { ...incoming, id: `payment:${otherHash}`, reference: otherHash, paymentHash: otherHash, amountSats: 600 },
    ];
    wallet.snapshot.mockResolvedValue({
      wallet: record,
      primary: { connected: true },
      balance: { totalSats: 1450, availableSats: 1450, pendingSats: 0 },
      activity,
    });
    wallet.awayReceipts.mockResolvedValue([paymentHash]);
    render(<Wallet />);
    await unlock();
    const trigger = await screen.findByRole('button', { name: /₿850/ });
    expect(wallet.awayReceipts).toHaveBeenCalledWith(record.id, activity, true);
    expect(within(trigger).getByText('Received while you were away')).toBeVisible();
    expect(within(screen.getByRole('button', { name: /₿600/ })).queryByText('Received while you were away')).toBeNull();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Received while you were away')).toBeVisible();
    expect(within(dialog).getByText('₿850')).toBeVisible();
    expect(within(dialog).getByText('Payment method').nextElementSibling).toHaveTextContent('Lightning');
    expect(within(dialog).queryByText('Bitcoin address')).toBeNull();
    expect(within(dialog).queryByText('bcrt1fallback')).toBeNull();
  });

  it('reopens the original unpaid offline invoice from Activity after unlocking', async () => {
    const paymentHash = 'ab'.repeat(32);
    const request = {
      id: 'offline-receive-1234',
      offlineReceive: true,
      amountSats: 750,
      feeSats: 0,
      description: 'Tea',
      bolt11: 'lnbcrt1savedoffline',
      uri: 'bitcoin:test?lightning=lnbcrt1savedoffline',
      paymentHash,
      expiresAt: Date.now() + 60_000,
      warnings: [],
      demo: false,
    };
    const receiveStatus = { phase: 'waiting', receivedSats: 0, confirmedSats: 0, pendingSats: 0, txids: [] };
    wallet.getReceiveStatus.mockResolvedValue(receiveStatus);
    wallet.snapshot.mockResolvedValue({
      wallet: record,
      primary: { connected: true },
      balance: { totalSats: 0, availableSats: 0, pendingSats: 0 },
      activity: [
        {
          id: request.id,
          kind: 'request',
          title: 'Payment request',
          status: 'pending',
          description: request.description,
          timestamp: Date.now(),
          amountSats: 750,
          feeSats: 0,
          reference: paymentHash,
          paymentHash,
          receiveRequest: request,
          receiveStatus,
        },
      ],
    });
    render(<Wallet />);
    await unlock();
    fireEvent.click(await screen.findByRole('button', { name: /₿750/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show invoice' }));
    expect(await screen.findByLabelText('Lightning invoice')).toHaveValue(request.bolt11);
    expect(screen.getByText(/You can close your wallet/)).toBeVisible();
    expect(wallet.quoteReceive).not.toHaveBeenCalled();
    expect(wallet.issueOffline).not.toHaveBeenCalled();
  });

  it('updates authoritative balance and Activity when an invoice settles after leaving Receive', async () => {
    const receipt = { phase: 'completed', receivedSats: 1000, confirmedSats: 1000, pendingSats: 0 };
    wallet.quoteReceive.mockResolvedValue({ id: 'invoice', amountSats: 1000, netSats: 980, feeSats: 20, warnings: [] });
    wallet.receive.mockResolvedValue({
      id: 'invoice',
      amountSats: 1000,
      uri: 'bitcoin:test',
      bolt11: 'lnbcrt1test',
      expiresAt: Date.now() + 60000,
      warnings: [],
    });
    let paid = false;
    let paidSnapshots = 0;
    wallet.getReceiveStatus.mockImplementation(async () => (paid ? receipt : { phase: 'waiting', receivedSats: 0 }));
    wallet.snapshot.mockImplementation(async () => {
      if (paid) paidSnapshots++;
      const credited = paidSnapshots >= 2;
      return {
        balance: { totalSats: credited ? 5980 : 5000, availableSats: credited ? 5980 : 5000, pendingSats: 0 },
        primary: { connected: true },
        activity: credited
          ? [
              {
                id: 'invoice',
                kind: 'received',
                status: 'completed',
                title: 'Lunch payment',
                timestamp: Date.now(),
                amountSats: 1000,
              },
            ]
          : [],
      };
    });
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.change(screen.getByLabelText(/Amount in bitcoin/), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review request' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create request' }));
    await screen.findByText('Waiting for payment');
    fireEvent.click(screen.getByRole('button', { name: 'Back to wallet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    paid = true;
    await waitFor(() => expect(paidSnapshots).toBeGreaterThan(0), { timeout: 4500 });
    fireEvent.click(screen.getByRole('button', { name: 'Back to wallet' }));
    expect(await screen.findByText('Lunch payment', {}, { timeout: 4500 })).toBeVisible();
    expect(screen.getByRole('group', { name: '₿5,980' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    expect(await screen.findByText('Payment received')).toBeVisible();
    expect(screen.queryByLabelText('Lightning invoice')).toBeNull();
  });

  it.each([
    { phase: 'pending', lifespan: 60_000, message: 'Payment pending' },
    { phase: 'pending', lifespan: -1000, message: 'Payment pending' },
    { phase: 'partial', lifespan: 60_000, message: 'Partially paid: ₿800' },
    { phase: 'partial', lifespan: -1000, message: 'Partially paid: ₿800' },
  ])(
    'keeps a detected $phase receipt visible and hides its code when fully paid or expired',
    async ({ phase, lifespan, message }) => {
      wallet.quoteReceive.mockResolvedValue({
        id: 'quote',
        amountSats: 1000,
        feeSats: 0,
        netSats: 1000,
        description: '',
        warnings: [],
      });
      wallet.receive.mockResolvedValue({
        id: 'request',
        amountSats: 1000,
        uri: 'bitcoin:test',
        bolt11: 'lnbcrt1test',
        expiresAt: Date.now() + lifespan,
        warnings: [],
      });
      wallet.getReceiveStatus.mockResolvedValue({ phase, receivedSats: phase === 'partial' ? 800 : 1000 });
      render(<Wallet />);
      await unlock();
      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.change(screen.getByLabelText(/Amount in bitcoin/), { target: { value: '1000' } });
      fireEvent.click(screen.getByRole('button', { name: 'Review request' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Create request' }));
      expect(await screen.findByText(message)).toBeVisible();
      expect(screen.queryByLabelText('Lightning invoice')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Copy request' })).toBeNull();
    },
  );

  it('opens a healthy or idle legacy session without a shutdown warning and preserves recovery details', async () => {
    wallet.inspect.mockResolvedValue({ exists: true, interrupted: true });
    wallet.snapshot.mockResolvedValue({
      wallet: record,
      balance: { totalSats: 2500, availableSats: 2000, pendingSats: 500, pending: { erroredSats: 500 } },
      primary: { connected: true, setup: 'ready' },
      activity: [],
      notes: ['Some receive requests are still being checked. Their last known status is shown.'],
    });
    render(<Wallet />);
    await unlock();
    expect(screen.queryByText(/stopped unexpectedly|Check the previous payment/)).toBeNull();
    expect(await screen.findByText('₿500 need recovery attention before they can be spent.')).toBeVisible();
    expect(screen.getByText(/Some receive requests are still being checked/)).toBeVisible();
    await waitFor(() => expect(wallet.acknowledgePayment).toHaveBeenCalledWith('legacy'));
  });

  it('keeps the review reminder when composite payment history is incomplete', async () => {
    wallet.inspect.mockResolvedValue({ exists: true, interrupted: true, paymentNeedsReview: true });
    wallet.snapshot.mockResolvedValue({
      wallet: record,
      balance: { totalSats: 0, availableSats: 0, pendingSats: 0 },
      primary: { connected: true },
      activity: [],
    });
    wallet.activityIncludesChannelSends.mockResolvedValueOnce(false);
    render(<Wallet />);
    await unlock();
    expect(await screen.findByText('Refresh the wallet to check all payment records.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'I checked Activity' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh wallet' }));
    expect(await screen.findByRole('button', { name: 'I checked Activity' })).toBeVisible();
    expect(wallet.acknowledgePayment).not.toHaveBeenCalled();
  });

  it.each([
    { paymentNeedsReview: true, rows: [] },
    { paymentNeedsReview: false, rows: [{ id: 'send', kind: 'sent', status: 'uncertain', timestamp: 1 }] },
  ])(
    'shows a relevant payment warning after unlock and permits review with verified Activity',
    async ({ paymentNeedsReview, rows }) => {
      wallet.inspect.mockResolvedValue({ exists: true, interrupted: true, paymentNeedsReview });
      wallet.snapshot.mockResolvedValue({
        wallet: record,
        primary: { connected: true },
        balance: { totalSats: 0, pendingSats: 0, availableSats: 0 },
        activity: rows.map((row) => ({ ...row, title: 'Outgoing payment', amountSats: 5 })),
      });
      render(<Wallet />);
      await screen.findByLabelText('Password', { exact: true });
      expect(screen.queryByText(/Check the previous payment/)).toBeNull();
      await unlock();
      expect(await screen.findByText(/Check the previous payment/)).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'I checked Activity' }));
      await waitFor(() => expect(screen.queryByText(/Check the previous payment/)).toBeNull());
      expect(wallet.acknowledgePayment).toHaveBeenCalledOnce();
      if (rows.length) expect(screen.getByText('Outgoing payment')).toBeVisible();
    },
  );

  it('discards a late unlock when the active account changes', async () => {
    let finish!: () => void;
    wallet.open.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = () => resolve({ network: 'regtest', primaryUri: 'peer' });
      }),
    );
    const view = render(<Wallet />);
    fireEvent.change(await screen.findByLabelText('Password', { exact: true }), {
      target: { value: 'example password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock wallet' }));
    wallet.account = 'account-two';
    view.rerender(<Wallet />);
    await act(async () => finish());
    expect(wallet.close).toHaveBeenCalled();
    expect(wallet.listWallets).not.toHaveBeenCalled();
    expect(await screen.findByLabelText('Password', { exact: true })).toHaveValue('');
  });
});
