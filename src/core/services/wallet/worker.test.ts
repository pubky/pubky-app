// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const files = new Map<string, Uint8Array>();
  const volume = {
    read: (path: string) => files.get(path)?.slice() ?? null,
    write: (path: string, bytes: Uint8Array) => files.set(path, bytes.slice()),
    list: (prefix: string) => [...files.keys()].filter((path) => path.startsWith(prefix)),
    close: vi.fn(),
  };
  const store = { markActive: vi.fn(), markClosed: vi.fn(), close: vi.fn() };
  const engine = { request: vi.fn(), setAppBackgrounded: vi.fn(), close: vi.fn() };
  return { files, volume, store, engine };
});
vi.mock('@beignet/portable-engine', () => ({
  createPortableRuntime: async () => fixture.engine,
  createRelaySocketFactory: () => ({}),
}));
vi.mock('@beignet/portable-engine/sqljs', () => ({ createSqlJsDatabaseFactory: async () => ({}) }));
vi.mock('./storage.mjs', () => ({ openFiles: async () => fixture.store, unlockVolume: async () => fixture.volume }));

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
type WorkerInput = { data: { id: number; operation: string; account: string; payload: unknown } };
let messageId = 0;
const waiters = new Map<number, (r: Reply) => void>();
const worker = {
  location: { href: 'https://example.invalid/worker.js' },
  onmessage: undefined as undefined | ((msg: WorkerInput) => Promise<void>),
  postMessage(r: Reply) {
    waiters.get(r.id)?.(r);
    waiters.delete(r.id);
  },
};
function request(operation: string, body?: unknown, account = owner) {
  const id = ++messageId;
  return new Promise<Reply>((resolve) => {
    waiters.set(id, resolve);
    void worker.onmessage!({ data: { id, operation, account, payload: body } });
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
