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
  let clock = 50_000;
  const open = () => createAwayReceipts(volume, false, () => clock);
  const advance = (ms: number) => {
    clock += ms;
  };
  return { open, volume, advance };
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

it('does not relabel historical receipts or payments after foreground reconciliation', () => {
  const { open, advance } = fixture();
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
  advance(8_001);
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

const draft = { id: 'reserved-request-01', amountSats: 6_000, description: 'Lunch', peer: '03' + 'c'.repeat(64) };
const issued = { ...draft, ...request };

it('tracks a verified invoice before its QR appears and survives closing before the first polling read', () => {
  const { open, volume, advance } = fixture();
  const session = open();
  session.begin(walletId, draft);
  expect(open().draft(walletId)).toEqual(draft);
  session.begin(walletId, draft);
  expect(volume.write).toHaveBeenCalledTimes(1);
  session.issued(walletId, issued);
  const returned = open();
  expect(returned.draft(walletId)).toBeNull();
  // The first foreground read is connected, but still shows the pre-close invoice.
  expect(returned.observe(walletId, [pending], true)).toEqual([]);
  advance(2_000);
  expect(returned.observe(walletId, [paid])).toEqual([paymentHash]);
  expect(volume.write).toHaveBeenCalledTimes(3);
});

it('preserves the reserved request, amount and primary when retrying an interruption', () => {
  const { open } = fixture();
  open().begin(walletId, draft);
  const returned = open();
  expect(() => returned.begin(walletId, { ...draft, peer: '02' + 'd'.repeat(64) })).toThrow('Resume');
  expect(() => returned.begin(walletId, { ...draft, amountSats: 7_000 })).toThrow('Resume');
  expect(() => returned.issued(walletId, { ...issued, offlineReceive: false })).toThrow();
  expect(() => returned.issued(walletId, { ...issued, peer: '02' + 'd'.repeat(64) })).toThrow();
  expect(() => returned.discard(walletId, 'changed-id')).toThrow();
  expect(returned.draft(walletId)).toEqual(draft);
  returned.discard(walletId, draft.id);
  expect(open().draft(walletId)).toBeNull();
});

it('retains the persisted draft if the invoice handoff fails', () => {
  const { open, volume } = fixture();
  const session = open();
  session.begin(walletId, draft);
  volume.write.mockImplementationOnce(() => {
    throw new Error('Storage full');
  });
  expect(() => session.issued(walletId, issued)).toThrow('Storage full');
  expect(open().draft(walletId)).toEqual(draft);
});

it('accepts a late receipt for an invoice that was already expired when the wallet reopened', () => {
  const { open, advance } = fixture();
  open().observe(walletId, [pending]);
  const returned = open();
  const expired = { ...request, expiresAt: 49_000 };
  returned.observe(walletId, [{ ...pending, receiveRequest: expired, status: 'expired' }]);
  advance(120_000);
  expect(returned.observe(walletId, [{ ...paid, receiveRequest: expired }])).toEqual([paymentHash]);
});

it('recovers a registered request whose response omits the original primary', () => {
  const { open } = fixture();
  const session = open();
  const description = '🌅'.repeat(128);
  session.begin(walletId, { ...draft, description });
  const saved = { ...issued, description, peer: undefined };
  session.issued(walletId, saved);
  expect(open().draft(walletId)).toBeNull();
  expect(open().observe(walletId, [paid])).toEqual([paymentHash]);
});
