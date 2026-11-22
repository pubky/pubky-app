import { describe, expect, it, vi } from 'vitest';
import { isMissingPrimary, matchesPrimaryPolicy, recoverPrimary } from './recover-primary.mjs';

const pubkey = '02' + 'ab'.repeat(32);
const primaryUri = pubkey + '@peer.relay:9735';
const id = 'ab'.repeat(16);
const api = `/wallets/${id}/api`;
const restored = { network: 'mainnet', mode: 'restore' };
const transferred = { network: 'mainnet', transferId: 'aaaa0000-0000-4000-8000-000000000001' };
const record = {
  id,
  network: 'mainnet',
  status: 'running',
  lfbw: {
    enabled: true,
    primaries: [],
    primaryUri: null,
    primaryPubkey: null,
    setup: 'failed',
    setupError: 'No primary node is configured',
  },
};
const node = {
  gate: 'disabled',
  fenced: false,
  startupRepairPending: false,
  backfillLost: false,
  awaitingDurabilityCount: 0,
};
const recovery = {
  mode: 'peer-storage',
  state: 'running',
  importPending: false,
  importComplete: true,
  autoApply: { phase: 'idle' },
  node,
};

describe('the restored wallet primary policy', () => {
  const entry = { pubkey, uri: primaryUri };
  const otherKey = '03' + 'ba'.repeat(32);
  const otherUri = otherKey + '@peer.relay:9735';
  const matches = (policy: unknown) =>
    matchesPrimaryPolicy({ network: 'mainnet', lfbw: policy }, 'mainnet', primaryUri);

  it.each([
    { primaries: [], primaryUri: null, primaryPubkey: null },
    { primaries: [entry], primaryUri, primaryPubkey: pubkey },
    { primaries: [entry] },
    { primaryUri, primaryPubkey: pubkey },
    { primaryUri },
  ])('recognizes an empty list or the previously configured peer (%#)', (policy) => {
    expect(matches({ enabled: true, ...policy })).toBe(true);
  });

  it.each([
    {},
    { primaryUri: null },
    { primaries: null, primaryUri },
    { primaries: 'empty' },
    { primaries: [null] },
    { primaries: [{ uri: primaryUri }] },
    { primaries: [entry, entry] },
    { primaries: [{ ...entry, pubkey: otherKey }] },
    { primaries: [{ ...entry, uri: otherUri }] },
    { primaries: [{ ...entry, uri: pubkey + '@different.relay:9735' }] },
    { primaries: [{ ...entry, fallbackUri: otherUri }] },
    { primaries: [entry], primaryFallbackUri: otherUri },
    { primaries: [entry], primaryPubkey: otherKey },
    { primaries: [], primaryUri: otherUri },
    { primaryUri: otherUri },
    { primaryUri, primaryPubkey: otherKey },
    { primaryUri, primaryWalletId: 'managed-primary' },
    { primaryUri, mode: 'managed' },
  ])('refuses a missing, ambiguous or different saved destination (%#)', (policy) => {
    expect(matches({ enabled: true, ...policy })).toBe(false);
  });
});

describe('restoring the deployment primary', () => {
  it.each([
    ['completed Ring recovery', restored, true],
    ['clean device transfer', transferred, false],
  ])(
    'adds only the missing native peer after %s and rereads the manager record',
    async (_label, binding, importComplete) => {
      const updated = { ...record, lfbw: { ...record.lfbw, primaries: [{ pubkey, uri: primaryUri }], setup: 'ready' } };
      const request = vi
        .fn()
        .mockResolvedValueOnce({
          ...recovery,
          importComplete,
          node: { ...node, channels: [{ restoreRecencyUnproven: true }] },
        })
        .mockResolvedValueOnce({ primaries: [], fillThresholdSat: 900 })
        .mockResolvedValueOnce({ primaries: [{ pubkey, host: 'peer.relay', port: 9735 }] })
        .mockResolvedValueOnce(updated);
      await expect(recoverPrimary({ request }, record, 'mainnet', primaryUri, vi.fn(), binding)).resolves.toBe(updated);
      expect(request.mock.calls.map(([input]) => input)).toEqual([
        { method: 'GET', path: api + '/recovery/status' },
        { method: 'GET', path: api + '/primaries' },
        { method: 'POST', path: api + '/primaries/add', body: { pubkey, host: 'peer.relay', port: 9735 } },
        { method: 'GET', path: '/api/wallets/' + id },
      ]);
      expect(isMissingPrimary(updated)).toBe(false);
    },
  );

  it.each([
    null,
    { ...record, id: '../other' },
    { ...record, status: 'stopped' },
    ...[
      { enabled: false },
      { primaries: undefined },
      { primaries: [{}] },
      { primaryUri },
      { primaryPubkey: pubkey },
      { setup: 'pending' },
      { setupError: 'Handshake timeout' },
    ].map((change) => ({ ...record, lfbw: { ...record.lfbw, ...change } })),
  ])('skips unmatched manager evidence before reading the node (%#)', async (candidate) => {
    const request = vi.fn();
    expect(isMissingPrimary(candidate)).toBe(false);
    await expect(recoverPrimary({ request }, candidate, 'mainnet', primaryUri, vi.fn(), restored)).resolves.toBe(
      candidate,
    );
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 'mainnet', primaryUri],
    [{ network: 'mainnet' }, 'mainnet', primaryUri],
    [{ ...transferred, transferId: 'invalid' }, 'mainnet', primaryUri],
    [{ ...restored, network: 'testnet' }, 'mainnet', primaryUri],
    [restored, 'testnet', primaryUri],
    [restored, 'mainnet', pubkey + '@peer.relay:65536'],
    [restored, 'mainnet', pubkey + '@peer.relay:9735/path'],
  ])('requires restoration evidence and a matching fixed deployment (%#)', async (binding, network, uri) => {
    const request = vi.fn();
    await expect(recoverPrimary({ request }, record, network, uri, vi.fn(), binding)).resolves.toBe(record);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    { state: 'restart-required' },
    { state: 'fenced' },
    { mode: 'off' },
    { importPending: true },
    { importComplete: false },
    { restore: { inProgress: true } },
    { autoApply: { phase: 'applying' } },
    { node: null },
    ...[
      { gate: 'quarantined' },
      { fenced: true },
      { startupRepairPending: true },
      { backfillLost: true },
      { awaitingDurabilityCount: 1 },
    ].map((change) => ({ node: { ...node, ...change } })),
  ])('preserves recovery and durability holds (%#)', async (change) => {
    const request = vi.fn().mockResolvedValueOnce({ ...recovery, ...change });
    await expect(recoverPrimary({ request }, record, 'mainnet', primaryUri, vi.fn(), restored)).resolves.toBe(record);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { primaries: null }, { primaries: [{ pubkey }] }, { primaries: [{ pubkey: 'other' }] }])(
    'requires a positively empty native list (%#)',
    async (native) => {
      const request = vi.fn().mockResolvedValueOnce(recovery).mockResolvedValueOnce(native);
      await expect(recoverPrimary({ request }, record, 'mainnet', primaryUri, vi.fn(), restored)).resolves.toBe(record);
      expect(request).toHaveBeenCalledTimes(2);
    },
  );

  it('rechecks the session immediately before the native add', async () => {
    const request = vi.fn().mockResolvedValueOnce(recovery).mockResolvedValueOnce({ primaries: [] });
    const assertCurrent = () => {
      if (request.mock.calls.length === 2) throw new Error('Wallet locked');
    };
    await expect(recoverPrimary({ request }, record, 'mainnet', primaryUri, assertCurrent, restored)).rejects.toThrow(
      'Wallet locked',
    );
    expect(request).toHaveBeenCalledTimes(2);
  });
});
