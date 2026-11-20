import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { startWalletKeyApproval } from '@/services/homeserver/wallet-identity';
import { WalletKeyApproval } from './WalletKeyApproval';

vi.mock('@/services/homeserver/wallet-identity', () => ({
  startWalletKeyApproval: vi.fn(),
  WalletKeyApprovalError: class extends Error {},
}));

it('abandons an open request when cancelled or when the wallet changes networks', () => {
  vi.mocked(startWalletKeyApproval).mockReturnValue({
    authorizationUrl: 'pubkyauth://test',
    result: new Promise<void>(() => {}),
  });
  const onKey = vi.fn();
  const onCancel = vi.fn();
  const props = { account: 'alice', onKey, onCancel };
  const page = render(<WalletKeyApproval {...props} network="testnet" />);
  const first = vi.mocked(startWalletKeyApproval).mock.calls.at(-1)![2];
  page.rerender(<WalletKeyApproval {...props} network="regtest" />);
  expect(first.aborted).toBe(true);
  const second = vi.mocked(startWalletKeyApproval).mock.calls.at(-1)![2];
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(second.aborted).toBe(true);
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onKey).not.toHaveBeenCalled();
});

it('displays a generic signer failure without revealing the rejected request', async () => {
  let fail!: (reason: unknown) => void;
  vi.mocked(startWalletKeyApproval).mockReturnValue({
    authorizationUrl: 'pubkyauth://test',
    result: new Promise((_, reject) => {
      fail = reject;
    }),
  });
  render(<WalletKeyApproval account="alice" network="mainnet" onKey={vi.fn()} onCancel={vi.fn()} />);
  await act(async () => fail(new Error('test-only-sensitive-approval-payload')));
  expect(screen.getByRole('alert')).toHaveTextContent('Wallet approval could not finish');
  expect(screen.queryByText(/test-only-sensitive/)).toBeNull();
});
