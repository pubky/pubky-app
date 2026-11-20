import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  quoteMax: vi.fn(),
  prepareDrain: vi.fn(),
  cancelDrain: vi.fn(),
  send: vi.fn(),
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
  wallet.startWallet.mockResolvedValue(undefined);
  wallet.rememberBalance.mockResolvedValue(undefined);
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
  await screen.findByText('Total balance');
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
    expect(screen.getByText('lnbcrt1destination')).toBeVisible();
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

  it('offers a watched on-chain deposit without asking the primary for inbound liquidity', async () => {
    const address = 'bcrt1qkgfgyxyqhvkdqh04sklnzxphmcds6vft6y7h0r';
    wallet.newBitcoinAddress.mockResolvedValue(address);
    render(<Wallet />);
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.change(screen.getByLabelText('Amount in bitcoin (optional)'), { target: { value: '1000' } });
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
    fireEvent.change(screen.getByLabelText('Amount in bitcoin (optional)'), { target: { value: '8000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review request' }));
    expect(await screen.findByText('₿110')).toBeVisible();
    expect(wallet.receive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Create request' }));
    expect(await screen.findByLabelText('Lightning invoice')).toHaveValue(request.bolt11);
    expect(wallet.receive).toHaveBeenCalledWith(quote);
    await waitFor(() => expect(wallet.getReceiveStatus).toHaveBeenCalledWith(request));
    fireEvent.click(screen.getByRole('button', { name: 'Unified request' }));
    expect(screen.getByLabelText('Payment request')).toHaveValue(request.uri);
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
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    paid = true;
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

  it('preserves the interrupted-session notice and the recovery portion of the pending balance', async () => {
    wallet.inspect.mockResolvedValue({ exists: true, interrupted: true });
    wallet.snapshot.mockResolvedValue({
      balance: { totalSats: 2500, availableSats: 2000, pendingSats: 500, pending: { erroredSats: 500 } },
      primary: { connected: true, setup: 'ready' },
      activity: [],
      notes: ['Some receive requests are still being checked. Their last known status is shown.'],
    });
    render(<Wallet />);
    const warning = 'The wallet stopped unexpectedly. Check Activity before retrying a payment.';
    expect(await screen.findByText(warning)).toBeVisible();
    await unlock();
    expect(screen.getByText(warning)).toBeVisible();
    expect(await screen.findByText('₿500 need recovery attention before they can be spent.')).toBeVisible();
    expect(screen.getByText(/Some receive requests are still being checked/)).toBeVisible();
  });

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
