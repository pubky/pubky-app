import { useEffect, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FundingState } from '@/libs/wallet/fundingState';
import type { TLockPrice } from '@/services/locks/locks.types';
import { CheckoutFunding } from './CheckoutFunding';
import { useWalletTask } from './WalletPanel';

const mocks = vi.hoisted(() => ({
  networks: vi.fn(),
  address: vi.fn(),
  prepareSend: vi.fn(),
  send: vi.fn(),
  snapshot: vi.fn(),
  locked: vi.fn(),
  opened: vi.fn(),
  auth: { currentUserPubky: 'reader', session: {} },
  unlockNetwork: 'regtest',
}));
vi.mock('@/libs/wallet/networks', () => ({ checkoutNetworks: mocks.networks }));
vi.mock('@/libs/wallet/bitkitFunding', () => ({ getBitkitFundingAddress: mocks.address }));
vi.mock('@/stores/auth/auth.store', () => ({ useAuthStore: { getState: () => mocks.auth } }));
vi.mock('./WalletAccount', () => ({
  WalletAccount: ({ renderReady, account }: { renderReady: (args: unknown) => React.ReactNode; account: string }) => {
    useEffect(() => {
      mocks.opened(account);
      return () => {
        mocks.locked(account);
      };
    }, [account]);
    const task = useWalletTask();
    return (
      <>
        {task.error && <p role="alert">{task.error}</p>}
        {renderReady({
          network: mocks.unlockNetwork,
          task,
          session: { send: mocks.send, client: { prepareSend: mocks.prepareSend, snapshot: mocks.snapshot } },
        })}
      </>
    );
  },
}));

const address = 'bcrt1ownbitkit';
const networks = { walletNetwork: 'regtest', locksNetwork: 'regtest' };
const price: TLockPrice = { asset: 'BTC', amount: '5000' };
function Checkout({ initial, lockPrice = price }: { initial?: FundingState; lockPrice?: TLockPrice }) {
  const [state, setState] = useState(initial);
  return <CheckoutFunding account="reader" price={lockPrice} state={state} onState={setState} />;
}
async function expand() {
  fireEvent.click(await screen.findByRole('button', { name: 'Fund my Bitkit from Pubky Wallet' }));
  return screen.findByRole('textbox', { name: /Funding amount/ });
}

describe('Bitkit checkout funding', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.currentUserPubky = 'reader';
    mocks.unlockNetwork = 'regtest';
    mocks.networks.mockResolvedValue(networks);
    mocks.address.mockResolvedValue(address);
    mocks.prepareSend.mockImplementation(async ({ amountSats }) => ({
      id: 'quote',
      route: 'bitcoin',
      destination: address,
      amountSats: Number(amountSats),
      feeSats: 83,
      totalSats: Number(amountSats) + 83,
      feeLabel: 'Estimated network fee',
      expiresAt: Date.now() + 60_000,
      warnings: [],
    }));
    mocks.send.mockResolvedValue({ id: 'quote', status: 'pending', txid: 'tx123' });
    mocks.snapshot.mockResolvedValue({ activity: [] });
  });
  it.each([
    [{ walletNetwork: 'mainnet', locksNetwork: 'regtest' }, /Pubky Wallet uses mainnet. This checkout uses regtest/],
    [{ walletNetwork: null, locksNetwork: 'regtest' }, /networks could not be verified/],
  ])(
    'closes on a mismatch or unknown network before reading addresses or opening a wallet',
    async (config, message) => {
      mocks.networks.mockResolvedValue(config);
      render(<Checkout />);
      expect(await screen.findByText(message as RegExp)).toBeVisible();
      expect(screen.queryByRole('button')).toBeNull();
      expect(mocks.address).not.toHaveBeenCalled();
      expect(mocks.opened).not.toHaveBeenCalled();
    },
  );
  it('shows a distinct, editable transfer to the reader and sends once only after confirmation', async () => {
    render(<Checkout />);
    const amount = await expand();
    expect(amount).toHaveValue('5000');
    expect(mocks.address).toHaveBeenCalledWith('reader', 'regtest');
    expect(mocks.opened).toHaveBeenCalledWith('reader');
    expect(mocks.send).not.toHaveBeenCalled();
    fireEvent.change(amount, { target: { value: '8000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review transfer' }));
    const confirm = await screen.findByRole('button', { name: 'Confirm transfer to my Bitkit' });
    expect(mocks.prepareSend).toHaveBeenCalledWith({ request: address, amountSats: '8000' });
    expect(screen.getByText('₿8,000')).toBeVisible();
    expect(screen.getByText('₿83')).toBeVisible();
    expect(screen.getByText('₿8,083')).toBeVisible();
    expect(mocks.send).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(await screen.findByText('Your transfer to Bitkit is pending confirmation.')).toBeVisible();
    expect(screen.getByText(/separate purchase request in Bitkit/)).toBeVisible();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.opened).toHaveBeenCalledTimes(1);
    expect(mocks.locked).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('leaves the funding amount blank for a USD price', async () => {
    render(<Checkout lockPrice={{ asset: 'USD', amount: '150' }} />);
    expect(await expand()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Review transfer' })).toBeDisabled();
  });
  it('blocks a restored vault for another network', async () => {
    mocks.unlockNetwork = 'mainnet';
    render(<Checkout />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fund my Bitkit from Pubky Wallet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your unlocked wallet uses mainnet');
    expect(mocks.prepareSend).not.toHaveBeenCalled();
  });
  it('drops a reviewed payment if the signed-in reader changes', async () => {
    render(<Checkout />);
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Review transfer' }));
    const confirm = await screen.findByRole('button', { name: 'Confirm transfer to my Bitkit' });
    mocks.auth.currentUserPubky = 'new-reader';
    fireEvent.click(confirm);
    await screen.findByRole('button', { name: 'Confirm transfer to my Bitkit' });
    expect(mocks.address).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('rechecks the address before sending and rejects a new recipient', async () => {
    render(<Checkout />);
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Review transfer' }));
    const confirm = await screen.findByRole('button', { name: 'Confirm transfer to my Bitkit' });
    mocks.address.mockResolvedValue('changed');
    fireEvent.click(confirm);
    expect(await screen.findByRole('alert')).toHaveTextContent('address or checkout network changed');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('drops a confirmation if the checkout closes during its asynchronous preflight', async () => {
    const view = render(<Checkout />);
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Review transfer' }));
    const confirm = await screen.findByRole('button', { name: 'Confirm transfer to my Bitkit' });
    const pending = Promise.withResolvers<string>();
    mocks.address.mockReturnValueOnce(pending.promise);
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.address).toHaveBeenCalledTimes(2));
    view.unmount();
    pending.resolve(address);
    await pending.promise;
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('keeps the signer alive before broadcast and tracks only the approved transfer', async () => {
    mocks.send.mockResolvedValue({ id: 'quote', status: 'pending' });
    const queued = Promise.withResolvers<{ activity: unknown[] }>();
    mocks.snapshot.mockReturnValue(queued.promise);
    render(<Checkout />);
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Review transfer' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm transfer to my Bitkit' }));
    expect(await screen.findByText('Your transfer to Bitkit is pending.')).toBeVisible();
    expect(mocks.locked).not.toHaveBeenCalled();
    queued.resolve({
      activity: [
        { id: 'submission:other', kind: 'sent', status: 'completed', txid: 'other' },
        { id: 'submission:quote', kind: 'sent', status: 'completed', txid: 'approved' },
      ],
    });
    expect(await screen.findByText('Your transfer to Bitkit completed.')).toBeVisible();
    expect(screen.getByText(/transaction ID approved/)).toBeVisible();
    expect(screen.queryByText(/transaction ID other/)).toBeNull();
    expect(mocks.locked).toHaveBeenCalledTimes(1);
  });
  it('reopens an existing transfer without a fresh recipient, quote or send', async () => {
    mocks.snapshot.mockResolvedValue({
      activity: [{ id: 'submission:old', kind: 'sent', status: 'completed', txid: 'mined' }],
    });
    const view = render(<Checkout initial={{ status: 'pending', id: 'old', network: 'regtest' }} />);
    expect(mocks.opened).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen wallet to track transfer' }));
    expect(await screen.findByText('Your transfer to Bitkit completed.')).toBeVisible();
    expect(mocks.address).not.toHaveBeenCalled();
    expect(mocks.prepareSend).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    view.unmount();
    expect(mocks.locked).toHaveBeenCalled();
  });
  it('keeps an uncertain transfer visible after returning to checkout', () => {
    render(<Checkout initial={{ status: 'uncertain' }} />);
    expect(screen.getByText(/status of your transfer to Bitkit is unknown/)).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
    expect(mocks.opened).not.toHaveBeenCalled();
  });
});
