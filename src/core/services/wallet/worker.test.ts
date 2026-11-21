// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { primaryChannelReadiness } from './channel-readiness.mjs';
import type { WalletStartProgress } from './session';
import type { createStartupScan } from './startup-scan.mjs';

const fixture = vi.hoisted(() => {
  const files = new Map<string, Uint8Array>();
  const volume = {
    read: (path: string) => files.get(path)?.slice() ?? null,
    write: vi.fn((path: string, bytes: Uint8Array) => files.set(path, bytes.slice())),
    list: (prefix: string) => [...files.keys()].filter((path) => path.startsWith(prefix)),
    compact: vi.fn(),
    enrollLocalUnlock: vi.fn(),
    close: vi.fn(),
  };
  const store = {
    readLocalUnlock: vi.fn(async () => null),
    paymentNeedsReview: vi.fn(() => false),
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
    unlock: vi.fn(async () => volume),
    unlockWithRing: vi.fn(async () => volume),
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
  unlockVolumeWithRing: fixture.unlockWithRing,
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
type StartProgress = WalletStartProgress & { id: number; event: 'start-progress' };
type WorkerInput = {
  data: {
    id: number;
    operation: string;
    account: string;
    payload: unknown;
    notifyUnlocked?: boolean;
    notifyStartProgress?: boolean;
  };
};
let messageId = 0;
const waiters = new Map<number, (r: Reply) => void>();
const unlocked = vi.fn<(event: OpenEvent) => void>();
const primaryChanged = vi.fn<(event: PrimaryEvent) => void>();
const progress = vi.fn<(event: StartProgress) => void>();
const worker = {
  location: { href: 'https://example.invalid/worker.js' },
  onmessage: undefined as undefined | ((msg: WorkerInput) => Promise<void>),
  postMessage(r: Reply | OpenEvent | PrimaryEvent | StartProgress) {
    if ('event' in r) {
      if (r.event === 'primary-change') primaryChanged(r);
      else if (r.event === 'start-progress') progress(r);
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
  notifyStartProgress = false,
) {
  const id = ++messageId;
  return new Promise<Reply>((resolve) => {
    waiters.set(id, resolve);
    void worker.onmessage!({ data: { id, operation, account, payload: body, notifyUnlocked, notifyStartProgress } });
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

it('opens the verified local Ring wallet for reading when its Bitcoin relay is unavailable', async () => {
  await freshWorker();
  fixture.files.set('/pubky/deployment.json', new TextEncoder().encode(JSON.stringify(grant)));
  fixture.files.set('/wallet/registry.json', Uint8Array.of(7));
  fetchGrant.mockRejectedValueOnce(new Error('disconnected'));
  const input = { network: 'regtest', deviceId: crypto.randomUUID(), key: key() };
  const result = await request('open-with-ring', input, owner, true);
  expect(result.result).toMatchObject({ network: 'regtest' });
  expect(unlocked).toHaveBeenCalledOnce();
  expect(input.key).toEqual(new Uint8Array(32));
  expect((await request('request', { method: 'POST', path: '/wallets/' + walletId + '/start' })).error?.code)
    .toBe('WALLET_CONFIGURATION');
});

it('rejects a returning Ring credential for a different saved network before exposing the wallet', async () => {
  await freshWorker();
  fixture.files.set('/pubky/deployment.json', new TextEncoder().encode(JSON.stringify({ ...grant, network: 'mainnet' })));
  const input = { network: 'regtest', deviceId: crypto.randomUUID(), key: key() };
  expect((await request('open-with-ring', input, owner, true)).error?.code).toBe('WALLET_CONFIGURATION');
  expect(unlocked).not.toHaveBeenCalled();
  expect(input.key).toEqual(new Uint8Array(32));
});

it('requires the device-specific pending intent before enabling Ring and rejects stale approvals', async () => {
  const scope = (await request('prepare-local-unlock')).result as { network: string; deviceId: string };
  const stale = { ...scope, deviceId: crypto.randomUUID(), key: key() };
  expect((await request('enroll-local-unlock', stale)).error?.code).toBe('WALLET_LOCAL_UNLOCK');
  expect(stale.key).toEqual(new Uint8Array(32));
  expect(fixture.volume.enrollLocalUnlock).not.toHaveBeenCalled();
  const valid = { ...scope, key: key() };
  expect((await request('enroll-local-unlock', valid)).error).toBeUndefined();
  expect(valid.key).toEqual(new Uint8Array(32));
  expect((await request('enroll-local-unlock', { ...scope, key: key() })).error?.code).toBe('WALLET_LOCAL_UNLOCK');
  expect(fixture.volume.enrollLocalUnlock).toHaveBeenCalledOnce();
});

it.each(['engine', 'compaction'])('holds the vault lease after an uncertain %s shutdown', async (failure) => {
  const stopped = Promise.withResolvers<void>();
  fixture.engine.close.mockReturnValueOnce(stopped.promise);
  const closing = request('close');
  expect(fixture.volume.compact).not.toHaveBeenCalled();
  if (failure === 'engine') stopped.reject(new Error('Node could not finish saving'));
  else {
    fixture.volume.compact.mockImplementationOnce(() => {
      throw new Error('Ambiguous full commit');
    });
    stopped.resolve();
  }
  expect((await closing).error?.code).toBe('WALLET_CLOSE_UNCERTAIN');
  expect((await request('close')).error?.code).toBe('WALLET_CLOSE_UNCERTAIN');
  expect(fixture.volume.compact).toHaveBeenCalledTimes(failure === 'engine' ? 0 : 1);
  expect(fixture.volume.close).not.toHaveBeenCalled();
});

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

it('refuses a transfer during payment review and wipes the approval without closing the node', async () => {
  const input = { ...payload(), sourceDeviceId: crypto.randomUUID(), transferId: crypto.randomUUID() };
  fixture.store.paymentNeedsReview.mockReturnValueOnce(true);
  expect((await request('handoff-export', input)).error?.code).toBe('WALLET_HANDOFF_PENDING');
  expect(input.key).toEqual(new Uint8Array(32));
  expect(fixture.engine.close).not.toHaveBeenCalled();
});

it('fences new business while draining an admitted request, and cancels a move when the lease closes', async () => {
  const held = Promise.withResolvers<object>();
  fixture.engine.request.mockReturnValueOnce(held.promise);
  const inflight = request('request', { method: 'GET', path: '/api/wallets' });
  const input = { ...payload(), sourceDeviceId: crypto.randomUUID(), transferId: crypto.randomUUID() };
  const move = request('handoff-export', input);
  expect((await request('begin-send')).error?.code).toBe('WALLET_BUSY');
  const closed = request('close');
  held.resolve({});
  await inflight;
  expect((await move).error?.code).toBe('WALLET_CLOSED');
  await closed;
  expect(input.key).toEqual(new Uint8Array(32));
});

it('does not install into a running destination and suppresses underlying wallet details', async () => {
  const input = {
    ...payload(),
    sourceDeviceId: crypto.randomUUID(),
    transferId: crypto.randomUUID(),
    targetDeviceId: crypto.randomUUID(),
    envelope: Uint8Array.of(1),
  };
  fixture.engine.request.mockResolvedValueOnce([{ id: walletId, status: 'running' }]);
  const response = await request('handoff-import', input);
  expect(response.error?.code).toBe('WALLET_BUSY');
  expect(response.result).toBeUndefined();
  expect(input.key).toEqual(new Uint8Array(32));
  expect(fixture.engine.close).not.toHaveBeenCalled();
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
  expect(primaryChanged.mock.calls).toEqual([
    [{ event: 'primary-change', account: owner }],
    [{ event: 'primary-change', account: owner }],
  ]);
  await request('close');
  onDiagnostic({ phase: 'peer:connect', message: key });
  expect(primaryChanged).toHaveBeenCalledTimes(2);
});

it('coalesces progress on a slow start using only the Bitcoin phase and authenticated primary status', async () => {
  const start = { method: 'POST', path: '/api/wallets/' + walletId + '/start' };
  const [{ onDiagnostic }] = fixture.createRuntime.mock.lastCall!;
  const [primary, onUsable] = vi.mocked(primaryChannelReadiness).mock.lastCall!;
  const deferred = Promise.withResolvers<void>();
  vi.useFakeTimers();
  try {
    await request('request', start, owner, false, true);
    vi.advanceTimersByTime(1500);
    expect(progress).not.toHaveBeenCalled();
    fixture.engine.request.mockReturnValueOnce(deferred.promise);
    const pending = request('request', start, owner, false, true);
    const id = messageId;
    vi.advanceTimersByTime(1200);
    expect(progress.mock.lastCall).toEqual([
      { id, event: 'start-progress', phase: 'opening', primaryConnected: false },
    ]);
    onDiagnostic({ phase: 'engine-perf', message: 'create 123ms' });
    onDiagnostic({ phase: 'peer:connect', message: '03' + 'b'.repeat(64) });
    vi.advanceTimersByTime(300);
    expect(progress.mock.lastCall).toEqual([
      { id, event: 'start-progress', phase: 'scanning', primaryConnected: false },
    ]);
    onDiagnostic({ phase: 'peer:connect', message: primary });
    onDiagnostic({ phase: 'engine-perf', message: 'initial-sync 751ms' });
    expect(progress).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(300);
    expect(progress.mock.lastCall).toEqual([
      { id, event: 'start-progress', phase: 'finishing', primaryConnected: true },
    ]);
    onDiagnostic({ phase: 'peer:disconnect', message: primary + ' private disconnect reason' });
    vi.advanceTimersByTime(300);
    expect(progress.mock.lastCall).toEqual([
      { id, event: 'start-progress', phase: 'finishing', primaryConnected: false },
    ]);
    deferred.resolve();
    expect((await pending).error).toBeUndefined();
    onDiagnostic({ phase: 'peer:connect', message: primary });
    vi.advanceTimersByTime(1500);
    expect(progress).toHaveBeenCalledTimes(4);
    expect(fixture.engine.request.mock.calls).toEqual([[start], [start]]);
  } finally {
    deferred.resolve();
    vi.useRealTimers();
  }
  primaryChanged.mockClear();
  onUsable();
  expect(primaryChanged.mock.calls).toEqual([[{ event: 'primary-change', account: owner }]]);
  await request('close');
  onUsable();
  expect(primaryChanged).toHaveBeenCalledOnce();
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
