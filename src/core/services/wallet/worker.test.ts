// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { primaryChannelReadiness } from './channel-readiness.mjs';
import type { WalletStartupTiming } from './session';
import type { createStartupScan } from './startup-scan.mjs';

const fixture = vi.hoisted(() => {
  const files = new Map<string, Uint8Array>();
  const volume = {
    read: (path: string) => files.get(path)?.slice() ?? null,
    write: vi.fn((path: string, bytes: Uint8Array) => files.set(path, bytes.slice())),
    list: (prefix: string) => [...files.keys()].filter((path) => path.startsWith(prefix)),
    close: vi.fn(),
  };
  const store = {
    markPayment: vi.fn(() => 0),
    restorePaymentMarker: vi.fn(),
    clearPayment: vi.fn(),
    close: vi.fn(),
  };
  const engine = { request: vi.fn(), setAppBackgrounded: vi.fn(), close: vi.fn() };
  return {
    files,
    volume,
    store,
    engine,
    unlock: vi.fn(
      async (_store?: object, _account?: string, _password?: string, _beginSave?: () => (() => void) | undefined) =>
        volume,
    ),
    inspect: vi.fn(async () => ({ exists: false })),
    sockets: { socketFactory: vi.fn(), prepareElectrum: vi.fn(), preparePeer: vi.fn(), close: vi.fn() },
    compile: vi.fn(async () => ({})),
    createRuntime: vi.fn(
      async (_options: {
        onDiagnostic: (event: { phase: string; message: string }) => void;
        nodeOptions?: ReturnType<typeof createStartupScan>['nodeOptions'];
      }) => engine,
    ),
  };
});
vi.mock('@beignet/portable-engine', () => ({
  createPortableRuntime: fixture.createRuntime,
}));
vi.mock('./startup-sockets.mjs', () => ({ createStartupSockets: () => fixture.sockets }));
vi.mock('./channel-readiness.mjs', { spy: true });
vi.mock('@beignet/portable-engine/sqljs', () => ({ createSqlJsDatabaseFactory: fixture.compile }));
vi.mock('./storage.mjs', () => ({
  inspectFiles: fixture.inspect,
  openFiles: async () => fixture.store,
  unlockVolume: fixture.unlock,
}));

const owner = 'y'.repeat(52);
const grant = {
  network: 'regtest',
  primaryUri: '02' + 'a'.repeat(64) + '@test:1',
  token: 'a'.repeat(32),
  expiresAt: Date.now() + 300000,
  electrum: { host: 'electrum.relay', port: 50001, tls: false },
  peerUrl: 'wss://example.invalid/p',
  electrumUrl: 'wss://example.invalid/e',
};
const key = () => new Uint8Array(32).fill(17);
const payload = () => ({ key: key(), network: 'regtest', mode: 'create' });
const walletId = 'e'.repeat(32);
type Reply = { id: number; result?: unknown; error?: { code: string; message: string } };
type OpenEvent = { id: number; event: 'unlocked'; account: string; balance: unknown };
type PrimaryEvent = { event: 'primary-change'; account: string };
type TimingEvent = WalletStartupTiming & { event: 'startup-timing' };
type WorkerInput = {
  data: {
    id: number;
    operation: string;
    account: string;
    payload: unknown;
    notifyUnlocked?: boolean;
    notifyStartupTiming?: boolean;
  };
};
let messageId = 0;
const waiters = new Map<number, (r: Reply) => void>();
const unlocked = vi.fn<(event: OpenEvent) => void>();
const primaryChanged = vi.fn<(event: PrimaryEvent) => void>();
const timing = vi.fn<(event: TimingEvent) => void>();
const worker = {
  location: { href: 'https://example.invalid/worker.js' },
  onmessage: undefined as undefined | ((msg: WorkerInput) => Promise<void>),
  postMessage(r: Reply | OpenEvent | PrimaryEvent | TimingEvent) {
    if ('event' in r) {
      if (r.event === 'primary-change') primaryChanged(r);
      else if (r.event === 'startup-timing') timing(r);
      else unlocked(r);
      return;
    }
    waiters.get(r.id)?.(r);
    waiters.delete(r.id);
  },
};
function request(
  operation: string,
  body?: unknown,
  account = owner,
  notifyUnlocked = false,
  notifyStartupTiming = false,
) {
  const id = ++messageId;
  return new Promise<Reply>((resolve) => {
    waiters.set(id, resolve);
    void worker.onmessage!({ data: { id, operation, account, payload: body, notifyUnlocked, notifyStartupTiming } });
  });
}
const fetchGrant = vi.fn();
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  fixture.files.clear();
  fetchGrant.mockImplementation(async () => Response.json(grant));
  vi.stubGlobal('self', worker);
  vi.stubGlobal('fetch', fetchGrant);
  await import('./worker.mjs');
  await request('open', 'a local vault password');
});
afterEach(async () => {
  await request('close');
  vi.unstubAllGlobals();
});

async function freshWorker() {
  await request('close');
  vi.clearAllMocks();
  vi.resetModules();
  await import('./worker.mjs');
}

it('marks confirmed sends before allowing submission and preserves an unknown outcome across fresh opens', async () => {
  expect(fixture.store.markPayment).not.toHaveBeenCalled();
  expect((await request('begin-send')).error).toBeUndefined();
  expect(fixture.store.markPayment).toHaveBeenCalledOnce();
  expect((await request('begin-send')).error?.code).toBe('WALLET_BUSY');
  expect((await request('acknowledge-payment')).error?.code).toBe('WALLET_BUSY');
  await request('finish-send', 'uncertain');
  expect(fixture.store.restorePaymentMarker).not.toHaveBeenCalled();
  await freshWorker();
  await request('open', 'correct password');
  fixture.store.markPayment.mockReturnValueOnce(2);
  await request('begin-send');
  await request('finish-send', 'completed');
  expect(fixture.store.restorePaymentMarker).toHaveBeenCalledWith(2);
  await request('acknowledge-payment');
  expect(fixture.store.clearPayment).toHaveBeenCalledOnce();
  for (const status of ['completed', 'pending', 'failed']) {
    await request('begin-send');
    await request('finish-send', status);
  }
  expect(fixture.store.restorePaymentMarker.mock.calls).toEqual([[2], [0], [0], [0]]);
});

it('prepares SQL and a fixed relay ticket without unlocking, then reuses both during open', async () => {
  await freshWorker();
  const sql = Promise.withResolvers<object>();
  const ticket = Promise.withResolvers<Response>();
  fixture.compile.mockReturnValueOnce(sql.promise);
  fetchGrant.mockReturnValueOnce(ticket.promise);
  expect((await request('inspect')).result).toEqual({ exists: false });
  expect(fixture.unlock).not.toHaveBeenCalled();
  expect(fixture.createRuntime).not.toHaveBeenCalled();
  expect(fixture.compile).toHaveBeenCalledOnce();
  expect(fetchGrant).toHaveBeenCalledOnce();
  expect(fixture.sockets.prepareElectrum).not.toHaveBeenCalled();
  const opening = request('open', 'a local vault password');
  sql.resolve({});
  ticket.resolve(Response.json(grant));
  expect((await opening).error).toBeUndefined();
  expect(fixture.unlock).toHaveBeenCalledOnce();
  expect(fixture.createRuntime).toHaveBeenCalledOnce();
  expect(fixture.compile).toHaveBeenCalledOnce();
  expect(fetchGrant).toHaveBeenCalledOnce();
});

it('only warms idle Electrum on the visible returning password screen and cancels it on lock', async () => {
  await freshWorker();
  fixture.inspect.mockResolvedValue({ exists: true });
  try {
    await request('visibility', true);
    await request('inspect');
    expect(fixture.sockets.prepareElectrum).not.toHaveBeenCalled();
    await request('visibility', false);
    await request('inspect');
    await vi.waitFor(() => expect(fixture.sockets.prepareElectrum).toHaveBeenCalledOnce());
    expect(fixture.sockets.preparePeer).not.toHaveBeenCalled();
    expect(fixture.engine.request).not.toHaveBeenCalled();
    await request('visibility', true);
    expect(fixture.sockets.close).toHaveBeenCalledOnce();
    await freshWorker();
    const ticket = Promise.withResolvers<Response>();
    fetchGrant.mockReturnValueOnce(ticket.promise);
    await request('inspect');
    await request('close');
    ticket.resolve(Response.json(grant));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.sockets.prepareElectrum).not.toHaveBeenCalled();
  } finally {
    fixture.inspect.mockResolvedValue({ exists: false });
  }
});

it('drops prepared sockets on password failure and ignores diagnostics from a closed wallet', async () => {
  await freshWorker();
  fixture.inspect.mockResolvedValueOnce({ exists: true });
  await request('inspect');
  await vi.waitFor(() => expect(fixture.sockets.prepareElectrum).toHaveBeenCalledOnce());
  fixture.unlock.mockRejectedValueOnce(new Error('Wrong password'));
  expect((await request('open', 'wrong')).error).toBeDefined();
  expect(fixture.sockets.close).toHaveBeenCalledOnce();
  expect(fixture.sockets.preparePeer).not.toHaveBeenCalled();
  await request('open', 'correct password');
  const [{ onDiagnostic }] = fixture.createRuntime.mock.lastCall!;
  onDiagnostic({ phase: 'engine-perf', message: 'restore-graph' });
  expect(fixture.sockets.preparePeer).not.toHaveBeenCalled();
  const created = { phase: 'engine-perf', message: 'create 240ms' };
  onDiagnostic(created);
  expect(fixture.sockets.preparePeer).toHaveBeenCalledOnce();
  await request('close');
  onDiagnostic(created);
  expect(fixture.sockets.preparePeer).toHaveBeenCalledOnce();
});

it('signals a status reread only for the active primary without exposing peer diagnostics', async () => {
  const [{ onDiagnostic }] = fixture.createRuntime.mock.lastCall!;
  const key = grant.primaryUri.split('@')[0];
  onDiagnostic({ phase: 'peer:connect', message: '03' + 'b'.repeat(64) });
  onDiagnostic({ phase: 'peer:warning', message: key });
  expect(primaryChanged).not.toHaveBeenCalled();
  onDiagnostic({ phase: 'peer:connect', message: key });
  onDiagnostic({ phase: 'peer:disconnect', message: key + ' closed by peer: timed out' });
  onDiagnostic({ phase: 'engine-perf', message: 'create 10ms' });
  expect(timing).not.toHaveBeenCalled();
  expect(primaryChanged.mock.calls).toEqual([
    [{ event: 'primary-change', account: owner }],
    [{ event: 'primary-change', account: owner }],
  ]);
  await request('close');
  onDiagnostic({ phase: 'peer:connect', message: key });
  expect(primaryChanged).toHaveBeenCalledTimes(2);
});

it('reports only local allowlisted timings on opt-in and keeps channel hints independent of the measurement', async () => {
  const [primary, usable] = vi.mocked(primaryChannelReadiness).mock.lastCall!;
  expect(primary).toBe(grant.primaryUri.split('@')[0]);
  usable();
  expect(primaryChanged).toHaveBeenCalledOnce();
  expect(timing).not.toHaveBeenCalled();
  await freshWorker();
  await request('open', 'vault password', owner, false, true);
  const [{ onDiagnostic }] = fixture.createRuntime.mock.lastCall!;
  const [, channelUsable] = vi.mocked(primaryChannelReadiness).mock.lastCall!;
  const beginSave = fixture.unlock.mock.lastCall![3]!;
  const clock = vi.spyOn(performance, 'now').mockReturnValue(500);
  try {
    const start = { method: 'POST', path: '/api/wallets/' + walletId + '/start' };
    fixture.engine.request.mockRejectedValueOnce(new Error('start failed'));
    expect((await request('request', start)).error).toBeDefined();
    expect(timing).not.toHaveBeenCalled();
    clock.mockReturnValue(600);
    fixture.engine.request.mockImplementationOnce(() => {
      clock.mockReturnValue(750);
      onDiagnostic({ phase: 'engine-perf', message: 'create 100ms ' + walletId });
      onDiagnostic({ phase: 'engine-perf', message: 'restore-graph private text' });
      onDiagnostic({ phase: 'peer:connect', message: '03' + 'b'.repeat(64) });
      onDiagnostic({ phase: 'peer:disconnect', message: primary });
      expect(timing).not.toHaveBeenCalled();
      onDiagnostic({ phase: 'engine-perf', message: 'create 100ms' });
      const firstWrite = beginSave();
      clock.mockReturnValue(760);
      firstWrite?.();
      clock.mockReturnValue(770);
      const secondWrite = beginSave();
      clock.mockReturnValue(795);
      secondWrite?.();
      onDiagnostic({ phase: 'engine-perf', message: 'initial-sync 45ms' });
      onDiagnostic({ phase: 'peer:connect', message: primary });
      onDiagnostic({ phase: 'peer:connect', message: primary });
      channelUsable();
      channelUsable();
      clock.mockReturnValue(800);
    });
    await request('request', start);
    onDiagnostic({ phase: 'engine-perf', message: 'restore-graph 325ms channels 990 nodes 15 load 31+20ms' });
    expect(timing.mock.calls.map(([event]) => event)).toEqual([
      { event: 'startup-timing', phase: 'electrum-verification', durationMs: 50 },
      { event: 'startup-timing', phase: 'node-restore', durationMs: 100 },
      { event: 'startup-timing', phase: 'initial-sync', durationMs: 45 },
      { event: 'startup-timing', phase: 'first-primary-connected' },
      { event: 'startup-timing', phase: 'first-channel-usable' },
      { event: 'startup-timing', phase: 'vault-writes', durationMs: 35 },
      { event: 'startup-timing', phase: 'engine-start', durationMs: 200 },
      { event: 'startup-timing', phase: 'routing-graph-restored', durationMs: 325 },
    ]);
    expect(fixture.engine.request.mock.calls).toEqual([[start], [start]]);
    expect(fetchGrant).toHaveBeenCalledOnce();
    expect(primaryChanged).toHaveBeenCalledTimes(5);
    await request('close');
    onDiagnostic({ phase: 'peer:connect', message: primary });
    channelUsable();
    expect(primaryChanged).toHaveBeenCalledTimes(5);
  } finally {
    clock.mockRestore();
  }
});

it('opens the fixed peer transport before the foreground engine start, after access checks', async () => {
  const start = { method: 'POST', path: '/api/wallets/' + walletId + '/start' };
  expect((await request('request', start, 'other')).error).toBeDefined();
  await request('request', { method: 'GET', path: '/api/wallets' });
  expect(fixture.sockets.preparePeer).not.toHaveBeenCalled();
  fixture.engine.request.mockImplementationOnce(() => {
    expect(fixture.sockets.preparePeer).toHaveBeenCalledOnce();
    return {};
  });
  expect((await request('request', start)).error).toBeUndefined();
  await request('visibility', true);
  await request('request', start);
  expect(fixture.sockets.preparePeer).toHaveBeenCalledOnce();
});

it('replaces a nearly expired prefetch and cancels an outstanding ticket on lock', async () => {
  await freshWorker();
  fetchGrant.mockResolvedValueOnce(Response.json({ ...grant, expiresAt: Date.now() + 1000 }));
  await request('inspect');
  expect((await request('open', 'a local vault password')).error).toBeUndefined();
  expect(fetchGrant).toHaveBeenCalledTimes(2);
  await freshWorker();
  let signal!: AbortSignal;
  fetchGrant.mockImplementationOnce((_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  });
  await request('inspect');
  await request('close');
  expect(signal.aborted).toBe(true);
  expect(fixture.unlock).not.toHaveBeenCalled();
  expect(fixture.createRuntime).not.toHaveBeenCalled();
});

it('retries a failed prefetch when the user unlocks', async () => {
  await freshWorker();
  fetchGrant.mockRejectedValueOnce(new Error('offline'));
  await request('inspect');
  await Promise.resolve();
  expect((await request('open', 'a local vault password')).error).toBeUndefined();
  expect(fetchGrant).toHaveBeenCalledTimes(2);
  expect(fixture.createRuntime).toHaveBeenCalledOnce();
});
it('locks out competing operations during approval, zeroes rejected keys and respects closing during the grant recheck', async () => {
  const ready = Promise.withResolvers<Response>();
  fetchGrant.mockImplementationOnce(() => ready.promise);
  const incoming = payload();
  const provision = request('ring-wallet', incoming);
  const contender = payload();
  const duplicate = await request('ring-wallet', contender);
  expect(duplicate.error?.code).toBe('WALLET_BUSY');
  expect(contender.key).toEqual(new Uint8Array(32));
  const ordinary = await request('request', { method: 'POST', path: '/api/wallets' });
  expect(ordinary.error?.code).toBe('WALLET_BUSY');
  const close = request('close');
  ready.resolve(Response.json(grant));
  expect((await provision).error?.code).toBe('WALLET_CLOSED');
  await close;
  expect(fixture.engine.request).not.toHaveBeenCalled();
  expect(incoming.key).toEqual(new Uint8Array(32));
});
it('restricts staged Ring vaults, hides seed material and returns a public wallet handle only', async () => {
  const wrongOwner = payload();
  expect((await request('ring-wallet', wrongOwner, 'b' + owner.slice(1))).error).toBeDefined();
  expect(wrongOwner.key).toEqual(new Uint8Array(32));
  const device = await request('ring-device');
  expect(device.result).toMatch(/^[a-f0-9-]{36}$/);
  fixture.engine.request.mockRejectedValueOnce(new Error('sensitive dependency details'));
  const interrupted = await request('ring-wallet', payload());
  expect(interrupted.error?.message).not.toContain('sensitive');
  expect((await request('ring-binding')).result).toEqual({ deviceId: device.result, network: 'regtest' });
  for (const path of ['/api/wallets', '/api/wallets/import']) {
    expect((await request('request', { method: 'POST', path })).error?.code).toBe('WALLET_RING_BINDING');
  }
  fixture.engine.request.mockResolvedValueOnce({ mnemonic: 'hidden', record: { id: walletId, network: 'regtest' } });
  const approved = await request('ring-wallet', { ...payload(), mode: 'restore' });
  expect(approved.result).toEqual({ id: walletId, network: 'regtest' });
  expect(fixture.engine.request.mock.lastCall?.[0].body.recoveryAutoApply).toBe(false);
  fixture.engine.request.mockResolvedValueOnce({ mnemonic: 'hidden' });
  expect(
    (await request('request', { method: 'GET', path: '/wallets/' + walletId + '/api/mnemonic' })).error?.code,
  ).toBe('WALLET_RING_BINDING');
});
it('rejects an ordinary request in flight, a changed deployment and a cross-network restore', async () => {
  const ongoing = Promise.withResolvers<unknown>();
  fixture.engine.request.mockReturnValueOnce(ongoing.promise);
  const accepted = request('request', { method: 'GET', path: '/api/config' });
  expect((await request('ring-wallet', payload())).error?.code).toBe('WALLET_BUSY');
  ongoing.resolve({});
  await accepted;
  expect((await request('ring-wallet', { ...payload(), network: 'mainnet' })).error?.code).toBe('WALLET_CONFIGURATION');
  fetchGrant.mockResolvedValueOnce(Response.json({ ...grant, network: 'testnet' }));
  expect((await request('ring-wallet', payload())).error?.code).toBe('WALLET_CONFIGURATION');
  expect((await request('ring-binding')).result).toBeNull();
});

const balance = { walletId, network: 'regtest', totalSats: 4281 };
function addWalletRecord() {
  fixture.files.set(
    '/wallet/registry.json',
    new TextEncoder().encode(JSON.stringify({ record: { id: walletId, network: 'regtest' } })),
  );
}

it('restores pending observations on unlock and fences receipt reads to their owner', async () => {
  addWalletRecord();
  const paymentHash = 'b'.repeat(64);
  const waiting = {
    paymentHash,
    receiveRequest: { offlineReceive: true, paymentHash },
    kind: 'request',
    status: 'pending',
    receiveStatus: { phase: 'waiting' },
  };
  const pending = { walletId, rows: [waiting], primaryConnected: true };
  expect((await request('away-receipts', pending)).result).toEqual([]);
  await freshWorker();
  await request('open', 'a local vault password');
  expect((await request('away-receipts', { ...pending, primaryConnected: false })).result).toEqual([]);
  const completed = {
    ...pending,
    rows: [
      {
        ...waiting,
        kind: 'received',
        status: 'completed',
        receiveStatus: { phase: 'completed', method: 'lightning', paymentHash },
      },
    ],
  };
  expect((await request('away-receipts', completed, 'another account')).error).toBeDefined();
  expect((await request('away-receipts', completed)).result).toEqual([paymentHash]);
});

it('remembers only changed canonical totals for the owning registry and reports them before relay startup', async () => {
  expect((await request('remember-balance', balance)).error).toBeDefined();
  addWalletRecord();
  for (const invalid of [
    { walletId: 'f'.repeat(32) },
    { network: 'mainnet' },
    { totalSats: -1 },
    { totalSats: 0.5 },
    { totalSats: 2.2e15 },
  ]) {
    expect((await request('remember-balance', { ...balance, ...invalid })).error).toBeDefined();
  }
  expect((await request('remember-balance', balance, 'b' + owner.slice(1))).error).toBeDefined();
  fixture.volume.write.mockClear();
  for (const totalSats of [4281, 4281, 0, 0]) {
    expect((await request('remember-balance', { ...balance, totalSats })).error).toBeUndefined();
  }
  expect(fixture.volume.write).toHaveBeenCalledTimes(2);
  await freshWorker();
  const grantRequest = Promise.withResolvers<Response>();
  const sequence: string[] = [];
  unlocked.mockImplementationOnce(() => {
    sequence.push('unlocked');
  });
  fetchGrant.mockImplementationOnce(() => {
    sequence.push('relay');
    return grantRequest.promise;
  });
  const opening = request('open', 'vault password', owner, true);
  await vi.waitFor(() => expect(unlocked).toHaveBeenCalledOnce());
  expect(unlocked.mock.calls[0][0]).toMatchObject({
    account: owner,
    balance: { ...balance, totalSats: 0, updatedAt: expect.any(Number) },
  });
  expect(sequence).toEqual(['unlocked', 'relay']);
  expect(fixture.engine.request).not.toHaveBeenCalled();
  grantRequest.resolve(Response.json(grant));
  expect((await opening).error).toBeUndefined();
});

it('keeps missing or mismatched previews private and sends no event when decryption fails or a lock races unlock', async () => {
  addWalletRecord();
  await request('remember-balance', balance);
  await freshWorker();
  fixture.unlock.mockRejectedValueOnce(new Error('Wrong password'));
  expect((await request('open', 'wrong', owner, true)).error).toBeDefined();
  expect(unlocked).not.toHaveBeenCalled();
  fixture.files.delete('/wallet/registry.json');
  await request('open', 'vault password', owner, true);
  expect(unlocked.mock.lastCall?.[0].balance).toBeNull();
  await freshWorker();
  const decrypt = Promise.withResolvers<typeof fixture.volume>();
  fixture.unlock.mockImplementationOnce(() => decrypt.promise);
  const opening = request('open', 'vault password', owner, true);
  const close = request('close');
  decrypt.resolve(fixture.volume);
  expect((await opening).error?.code).toBe('WALLET_CLOSED');
  expect(unlocked).not.toHaveBeenCalled();
  await close;
});

it('opens a valid wallet when the optional preview is corrupt, out of date range, or unreadable', async () => {
  addWalletRecord();
  const path = '/pubky/last-balance-v1.json';
  for (const value of [
    'invalid JSON',
    JSON.stringify({ ...balance, version: 1, updatedAt: Number.MAX_SAFE_INTEGER }),
  ]) {
    fixture.files.set(path, new TextEncoder().encode(value));
    await freshWorker();
    expect((await request('open', 'vault password', owner, true)).error).toBeUndefined();
    expect(unlocked.mock.lastCall?.[0].balance).toBeNull();
  }
  await freshWorker();
  const read = vi.spyOn(fixture.volume, 'read').mockImplementationOnce(() => {
    throw new Error('Preview unavailable');
  });
  try {
    expect((await request('open', 'vault password', owner, true)).error).toBeUndefined();
    expect(unlocked.mock.lastCall?.[0].balance).toBeNull();
    expect(read.mock.calls[0]).toEqual([path]);
  } finally {
    read.mockRestore();
  }
});

it('only completes an accelerated startup after a failed scan recovers at the original cadence', async () => {
  const mainnet = { ...grant, network: 'mainnet', fastElectrumStart: true };
  fixture.files.set(
    '/wallet/registry.json',
    new TextEncoder().encode(JSON.stringify({ record: { id: walletId, network: 'mainnet' } })),
  );
  fixture.files.delete('/pubky/deployment.json');
  await freshWorker();
  fetchGrant.mockResolvedValueOnce(Response.json(mainnet));
  expect((await request('open', 'vault password')).error).toBeUndefined();
  const { nodeOptions, onDiagnostic } = fixture.createRuntime.mock.lastCall![0];
  const wallet = {
    electrum: { batchLimit: 20, batchDelay: 50 },
    gapLimitOptions: { lookAhead: 20, lookBehind: 20, lookAheadChange: 20, lookBehindChange: 20 },
    transactions: {},
    utxos: [],
    isRefreshing: false,
    refreshFailed: true,
  };
  nodeOptions!.extensions[0].attach({ wallet, generation: 1 });
  expect(wallet.electrum.batchDelay).toBe(15);
  onDiagnostic({ phase: 'engine-perf', message: 'initial-sync 3000ms' });
  expect(wallet.electrum.batchDelay).toBe(50);
  const start = { method: 'POST', path: '/api/wallets/' + walletId + '/start' };
  const refresh = { method: 'POST', path: '/wallets/' + walletId + '/api/wallet/refresh', body: {} };
  expect((await request('request', start)).error?.code).toBe('WALLET_SYNC_INCOMPLETE');
  expect(fixture.engine.request.mock.lastCall).toEqual([refresh]);
  fixture.engine.request.mockResolvedValueOnce({ status: 'running' }).mockImplementationOnce(async () => {
    wallet.refreshFailed = false;
  });
  expect((await request('request', start)).result).toEqual({ status: 'running' });
  expect(fixture.engine.request.mock.lastCall).toEqual([refresh]);
});
