import { WalletError } from '@beignet/wallet-core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bech32 } from 'bech32';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LastWalletBalance } from '@/services/wallet/session';
import { Wallet } from './Wallet';

const wallet = vi.hoisted(() => ({
  account: 'account-one',
  exists: true,
  inspect: vi.fn(),
  rememberBalance: vi.fn(),
  awayReceipts: vi.fn(),
  unlocked: undefined as ((preview: LastWalletBalance | null) => void) | undefined,
  ringBinding: vi.fn(),
  ringDeviceId: vi.fn(),
  createRingWallet: vi.fn(),
  guardRingDevice: vi.fn(),
  ringEnrollment: vi.fn(),
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
  resolveRecipient: vi.fn(),
}));

vi.mock('@/services/wallet/ring-enrollment', () => ({
  ringEnrollment: wallet.ringEnrollment,
  acquireRingDevice: wallet.acquireRingDevice,
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
    constructor(_account: string, onUnlocked?: (preview: LastWalletBalance | null) => void) {
      wallet.unlocked = onUnlocked;
    }
    rememberBalance = wallet.rememberBalance;
    awayReceipts = wallet.awayReceipts;
    send = wallet.send;
    acknowledgePayment = wallet.acknowledgePayment;
    activityIncludesChannelSends = wallet.activityIncludesChannelSends;
    client = wallet;
    inspect = wallet.inspect;
    ringBinding = wallet.ringBinding;
    ringDeviceId = wallet.ringDeviceId;
    createRingWallet = wallet.createRingWallet;
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
  wallet.rememberBalance.mockResolvedValue(undefined);
  wallet.awayReceipts.mockResolvedValue([]);
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
    expect(await screen.findByText('Last verified balance')).toBeVisible();
    expect(screen.getByText('₿4,200')).toBeVisible();
    await screen.findByText('Syncing Bitcoin and connecting to Lightning…');
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(wallet.snapshot).not.toHaveBeenCalled();
    await act(async () => finishStart());
    expect(await screen.findByRole('group', { name: '₿4,700' })).toBeVisible();
    expect(wallet.rememberBalance).toHaveBeenCalledWith(record.id, 'regtest', 4700);
    expect(screen.queryByText('Last verified balance')).toBeNull();
  });

  it('shows a single balance when every unit is available to send', async () => {
    wallet.snapshot.mockResolvedValue({
      balance: { totalSats: 5000, availableSats: 5000, pendingSats: 0 },
      primary: { connected: true },
      activity: [],
    });
    render(<Wallet />);
    await unlock();
    expect(await screen.findByText('₿5,000')).toBeVisible();
    expect(screen.queryByText('Available to send')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
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
      fireEvent.change(await screen.findByLabelText('New wallet password'), { target: { value: 'example password' } });
      fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'example password' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.queryByRole('button', { name: 'Create with recovery phrase' })).toBeNull();
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

  it('keeps reconnect within reach when Lightning goes offline during a payment flow', async () => {
    const snapshot = { wallet: record, balance: { totalSats: 0, availableSats: 0, pendingSats: 0 }, activity: [] };
    wallet.snapshot.mockResolvedValue({ ...snapshot, primary: { connected: false, setup: 'ready' } });
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
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
    fireEvent.change(screen.getByLabelText('Amount in bitcoin'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Receive on-chain' }));
    expect(await screen.findByText(address)).toBeInTheDocument();
    expect(screen.getByTitle('Bitcoin deposit QR code')).toBeInTheDocument();
    expect(wallet.newBitcoinAddress).toHaveBeenCalledWith('regtest');
    expect(wallet.quoteReceive).not.toHaveBeenCalled();
    expect(wallet.receive).not.toHaveBeenCalled();
  });

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
    fireEvent.change(screen.getByLabelText('Amount in bitcoin'), { target: { value: '8000' } });
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

  it.each(['', '0', '00'])(
    'lets the sender set the amount on the first Lightning invoice with input "%s"',
    async (entered) => {
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
      const amount = screen.getByRole('textbox', { name: 'Amount in bitcoin' });
      expect(amount).toHaveAccessibleDescription('Leave blank or enter 0 to let the sender choose how much to pay.');
      if (entered) fireEvent.change(amount, { target: { value: entered } });
      fireEvent.click(screen.getByRole('button', { name: 'Review request' }));
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
    },
  );

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
    fireEvent.change(screen.getByLabelText('Amount in bitcoin'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review request' }));
    expect(await screen.findByText('You receive')).toBeVisible();
    expect(wallet.quoteReceive).toHaveBeenLastCalledWith({ amountSats: 1200, description: 'Coffee' });
    expect(wallet.receive).not.toHaveBeenCalled();
  });

  it('makes an on-chain request without a fixed amount when zero is entered', async () => {
    const user = userEvent.setup();
    const address = 'bcrt1qkgfgyxyqhvkdqh04sklnzxphmcds6vft6y7h0r';
    wallet.newBitcoinAddress.mockResolvedValue(address);
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.change(screen.getByLabelText('Amount in bitcoin'), { target: { value: '00' } });
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
      incoming,
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
