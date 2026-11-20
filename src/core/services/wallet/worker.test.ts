// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const files = new Map<string, Uint8Array>();
  const volume = {
    read: (path: string) => files.get(path)?.slice() ?? null,
    write: vi.fn((path: string, bytes: Uint8Array) => files.set(path, bytes.slice())),
    list: (prefix: string) => [...files.keys()].filter((path) => path.startsWith(prefix)),
    close: vi.fn(),
  };
  const store = { markActive: vi.fn(), markClosed: vi.fn(), close: vi.fn() };
  const engine = { request: vi.fn(), setAppBackgrounded: vi.fn(), close: vi.fn() };
  return {
    files,
    volume,
    store,
    engine,
    unlock: vi.fn(async () => volume),
    inspect: vi.fn(async () => ({ exists: false })),
    compile: vi.fn(async () => ({})),
    createRuntime: vi.fn(async () => engine),
  };
});
vi.mock('@beignet/portable-engine', () => ({
  createPortableRuntime: fixture.createRuntime,
  createRelaySocketFactory: () => ({}),
}));
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
type WorkerInput = {
  data: { id: number; operation: string; account: string; payload: unknown; notifyUnlocked?: boolean };
};
let messageId = 0;
const waiters = new Map<number, (r: Reply) => void>();
const unlocked = vi.fn<(event: OpenEvent) => void>();
const worker = {
  location: { href: 'https://example.invalid/worker.js' },
  onmessage: undefined as undefined | ((msg: WorkerInput) => Promise<void>),
  postMessage(r: Reply | OpenEvent) {
    if ('event' in r) {
      unlocked(r);
      return;
    }
    waiters.get(r.id)?.(r);
    waiters.delete(r.id);
  },
};
function request(operation: string, body?: unknown, account = owner, notifyUnlocked = false) {
  const id = ++messageId;
  return new Promise<Reply>((resolve) => {
    waiters.set(id, resolve);
    void worker.onmessage!({ data: { id, operation, account, payload: body, notifyUnlocked } });
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
  const opening = request('open', 'a local vault password');
  sql.resolve({});
  ticket.resolve(Response.json(grant));
  expect((await opening).error).toBeUndefined();
  expect(fixture.unlock).toHaveBeenCalledOnce();
  expect(fixture.createRuntime).toHaveBeenCalledOnce();
  expect(fixture.compile).toHaveBeenCalledOnce();
  expect(fetchGrant).toHaveBeenCalledOnce();
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
