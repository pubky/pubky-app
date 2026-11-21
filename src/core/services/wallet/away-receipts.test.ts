// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createAwayReceipts } from './away-receipts.mjs';

const walletId = 'a'.repeat(32);
const paymentHash = 'b'.repeat(64);
const request = { paymentHash, offlineReceive: true, demo: false };
const pending = {
  kind: 'request',
  status: 'pending',
  paymentHash,
  receiveRequest: request,
  receiveStatus: { phase: 'waiting' },
};
const paid = {
  ...pending,
  kind: 'received',
  status: 'completed',
  receiveStatus: { phase: 'completed', method: 'lightning', paymentHash },
};
function fixture() {
  const files = new Map([
    ['/wallet/registry.json', new TextEncoder().encode(JSON.stringify({ record: { id: walletId } }))],
  ]);
  const volume = {
    read: (path: string) => files.get(path),
    write: vi.fn((path: string, bytes: Uint8Array<ArrayBuffer>) => files.set(path, bytes)),
  };
  const open = () => createAwayReceipts(volume, false);
  return { open, volume };
}

it('remembers a verified offline receipt across locks without re-writing unchanged snapshots', () => {
  const { open, volume } = fixture();
  expect(open().observe(walletId, [pending])).toEqual([]);
  const returned = open();
  expect(returned.observe(walletId, [pending], false)).toEqual([]);
  expect(returned.observe(walletId, [{ ...paid, receiveStatusUnavailable: true }])).toEqual([]);
  expect(returned.observe(walletId, [paid])).toEqual([paymentHash]);
  expect(returned.observe(walletId, [paid])).toEqual([paymentHash]);
  expect(open().observe(walletId, [paid])).toEqual([paymentHash]);
  expect(volume.write).toHaveBeenCalledTimes(2);
});

it('does not relabel historical receipts or payments that settled after a foreground check', () => {
  const { open } = fixture();
  const first = open();
  const old = 'c'.repeat(64);
  const historical = {
    ...paid,
    paymentHash: old,
    receiveRequest: { ...request, paymentHash: old },
    receiveStatus: { ...paid.receiveStatus, paymentHash: old },
  };
  expect(first.observe(walletId, [pending, historical])).toEqual([]);
  const returned = open();
  expect(returned.observe(walletId, [pending, historical])).toEqual([]);
  expect(returned.observe(walletId, [paid, historical])).toEqual([]);
  expect(open().observe(walletId, [paid, historical])).toEqual([]);
});

it('does not start tracking an already expired request as an outstanding invoice', () => {
  const { open } = fixture();
  open().observe(walletId, [{ ...pending, status: 'expired' }]);
  expect(open().observe(walletId, [paid])).toEqual([]);
});

it.each([true, false])('recognizes a return after a hidden tab with a background read of %s', (readWhileHidden) => {
  const session = fixture().open();
  expect(session.observe(walletId, [pending])).toEqual([]);
  session.setHidden(true);
  if (readWhileHidden) expect(session.observe(walletId, [pending])).toEqual([]);
  session.setHidden(false);
  expect(session.observe(walletId, [paid])).toEqual([paymentHash]);
});

it.each([
  { ...paid, kind: 'sent' },
  { ...paid, status: 'pending' },
  { ...paid, receiveStatus: { ...paid.receiveStatus, method: 'bitcoin' } },
  { ...paid, receiveStatus: { ...paid.receiveStatus, method: 'direct-funding' } },
  { ...paid, receiveStatus: { ...paid.receiveStatus, paymentHash: 'c'.repeat(64) } },
  { ...paid, receiveRequest: { ...request, offlineReceive: false } },
  { ...paid, receiveRequest: { ...request, demo: true } },
])('requires a matching, completed offline Lightning receipt', (row) => {
  const { open } = fixture();
  open().observe(walletId, [pending]);
  expect(open().observe(walletId, [row])).toEqual([]);
});

it('leaves the vault untouched for an ordinary payment and rejects another wallet', () => {
  const { open, volume } = fixture();
  const session = open();
  expect(session.observe(walletId, [{ ...paid, receiveRequest: { ...request, offlineReceive: false } }])).toEqual([]);
  expect(() => session.observe('c'.repeat(32), [pending])).toThrow('do not match');
  expect(volume.write).not.toHaveBeenCalled();
});
