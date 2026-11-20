// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createStartupSockets } from './startup-sockets.mjs';

const sockets: TestSocket[] = [];
class TestSocket {
  readyState = 0;
  onopen?: () => void;
  onerror?: () => void;
  onclose?: (event: { code: number }) => void;
  onmessage?: (event: { data: Uint8Array }) => void;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  });
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    sockets.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
}
const electrum = { host: 'electrum.relay', port: 50001, tls: false };
const primary = { host: 'peer.relay', port: 9735, tls: false };
const electrumUrl = 'wss://relay.example/electrum';
const peerUrl = 'wss://relay.example/peer';
const makeGrant = () => ({
  electrumUrl,
  peerUrl,
  electrum,
  token: 'a'.repeat(48),
  expiresAt: Date.now() + 900_000,
  WebSocket: TestSocket,
});

beforeEach(() => {
  vi.useFakeTimers();
  sockets.length = 0;
});
afterEach(() => vi.useRealTimers());

it('opens only two Electrum transports, writes nothing, and hands off both connecting and open sockets once', async () => {
  const pool = createStartupSockets(makeGrant());
  pool.prepareElectrum();
  pool.prepareElectrum();
  expect(sockets.map((s) => s.url)).toEqual([electrumUrl, electrumUrl]);
  expect(pool.socketFactory.fixedUpstream).toBe(true);
  sockets[0].open();
  expect(sockets.every((s) => s.send.mock.calls.length === 0)).toBe(true);
  const proof = pool.socketFactory(electrum);
  const scan = pool.socketFactory(electrum);
  const proofReady = vi.fn();
  const scanReady = vi.fn();
  proof.on('connect', proofReady);
  scan.on('connect', scanReady);
  expect(proofReady).not.toHaveBeenCalled();
  await Promise.resolve();
  expect(proofReady).toHaveBeenCalledOnce();
  expect(scanReady).not.toHaveBeenCalled();
  sockets[1].open();
  expect(scanReady).toHaveBeenCalledOnce();
  proof.write(Uint8Array.of(1));
  scan.write(Uint8Array.of(2));
  expect(sockets.map((s) => s.send.mock.calls.length)).toEqual([1, 1]);
  expect(vi.getTimerCount()).toBe(0);
  pool.socketFactory(electrum);
  expect(sockets).toHaveLength(3);
  pool.close();
  expect(sockets.every((s) => s.close.mock.calls.length === 0)).toBe(true);
});

it.each(['data', 'error', 'close'] as const)('discards unused sockets on %s and makes fresh dials', (event) => {
  const pool = createStartupSockets(makeGrant());
  pool.prepareElectrum();
  for (const socket of [...sockets]) {
    if (event === 'data') socket.onmessage?.({ data: Uint8Array.of(1) });
    else if (event === 'error') socket.onerror?.();
    else socket.close();
    expect(socket.readyState).toBe(3);
    expect(socket.onmessage).toBeNull();
    expect(socket.onerror).toBeNull();
    expect(socket.onclose).toBeNull();
  }
  expect(vi.getTimerCount()).toBe(0);
  pool.socketFactory(electrum);
  expect(sockets).toHaveLength(3);
});

it('expires unused connections, even before a timer suspended by a backgrounded browser runs', () => {
  const grant = makeGrant();
  grant.expiresAt = Date.now() + 500;
  const pool = createStartupSockets(grant);
  pool.prepareElectrum();
  vi.setSystemTime(Date.now() + 500);
  pool.socketFactory(electrum);
  expect(sockets.map((s) => s.readyState)).toEqual([3, 3, 0]);
  expect(vi.getTimerCount()).toBe(0);
});

it('closes idle sockets while a longer-lived ticket is still valid', () => {
  const pool = createStartupSockets(makeGrant());
  pool.prepareElectrum();
  vi.advanceTimersByTime(15_000);
  expect(sockets.map((s) => s.readyState)).toEqual([3, 3]);
  expect(vi.getTimerCount()).toBe(0);
});

it('allows one refill of unused Electrum slots on unlock after a long pause', () => {
  const pool = createStartupSockets(makeGrant());
  pool.prepareElectrum();
  vi.setSystemTime(Date.now() + 16_000);
  pool.prepareElectrum();
  pool.prepareElectrum();
  expect(sockets.map((s) => s.readyState)).toEqual([3, 3, 0, 0]);
  vi.advanceTimersByTime(15_000);
  pool.prepareElectrum();
  expect(sockets.map((s) => s.readyState)).toEqual([3, 3, 3, 3]);
  expect(vi.getTimerCount()).toBe(0);
});

it('leaves further Electrum connections to the engine after it starts using them', () => {
  const pool = createStartupSockets(makeGrant());
  pool.prepareElectrum();
  pool.socketFactory(electrum);
  vi.advanceTimersByTime(15_000);
  pool.prepareElectrum();
  expect(sockets.map((s) => s.readyState)).toEqual([0, 3]);
  expect(vi.getTimerCount()).toBe(0);
});

it('dials with the current ticket after a renewal and keeps owned sockets open on cleanup', () => {
  const grant = makeGrant();
  const pool = createStartupSockets(grant);
  pool.prepareElectrum();
  pool.socketFactory(electrum);
  grant.token = 'b'.repeat(48);
  pool.socketFactory(electrum);
  expect(sockets.map((s) => s.readyState)).toEqual([0, 3, 0]);
  expect(sockets[2].protocols).toEqual(['beignet.v1', 'auth.' + grant.token]);
  pool.preparePeer();
  pool.close();
  pool.close();
  pool.prepareElectrum();
  pool.preparePeer();
  expect(sockets.map((s) => s.readyState)).toEqual([0, 3, 0, 3]);
  expect(vi.getTimerCount()).toBe(0);
  pool.socketFactory(primary);
  expect(sockets.at(-1)?.url).toBe(peerUrl);
  expect(sockets).toHaveLength(5);
});

it('opens the fixed peer once on request and skips preparation after an ordinary peer dial', () => {
  const pool = createStartupSockets(makeGrant());
  pool.preparePeer();
  pool.preparePeer();
  expect(sockets.map((s) => s.url)).toEqual([peerUrl]);
  pool.socketFactory(electrum);
  pool.socketFactory(primary);
  expect(sockets.map((s) => s.url)).toEqual([peerUrl, electrumUrl]);
  expect(vi.getTimerCount()).toBe(0);
  const other = createStartupSockets(makeGrant());
  other.socketFactory(primary);
  other.preparePeer();
  expect(sockets.map((s) => s.url)).toEqual([peerUrl, electrumUrl, peerUrl]);
});

it('falls back to an ordinary dial after a speculative constructor error and validates relay settings before dialing', () => {
  const grant = makeGrant();
  let first = true;
  grant.WebSocket = class extends TestSocket {
    constructor(url: string, protocols: string[]) {
      if (first) {
        first = false;
        throw new Error('Unavailable');
      }
      super(url, protocols);
    }
  };
  const pool = createStartupSockets(grant);
  pool.prepareElectrum();
  expect(sockets).toHaveLength(0);
  pool.socketFactory(electrum);
  expect(sockets).toHaveLength(1);
  expect(() => createStartupSockets({ ...grant, electrumUrl: 'ws://untrusted.example/electrum' })).toThrow();
  expect(sockets).toHaveLength(1);
});

it('prepares only public Bitcoin checks on the hosted mainnet route and keeps the scan socket when the proof socket fails', () => {
  const pool = createStartupSockets({ ...makeGrant(), network: 'mainnet', fastElectrumStart: true });
  pool.prepareElectrum();
  const [proof, scan] = sockets;
  proof.open();
  scan.open();
  const firstRequest = (socket: TestSocket) => JSON.parse(new TextDecoder().decode(socket.send.mock.calls[0][0]));
  expect(firstRequest(proof)).toMatchObject({ method: 'blockchain.block.header', params: [0] });
  expect(firstRequest(scan)).toMatchObject({ method: 'server.version', params: ['beignet', '1.4'] });
  proof.close();
  const replacement = pool.socketFactory(electrum);
  const scanConnection = pool.socketFactory(electrum);
  expect(sockets).toHaveLength(3);
  expect(sockets[2].readyState).toBe(0);
  expect(scan.readyState).toBe(1);
  expect(sockets.every((socket) => socket.url === electrumUrl)).toBe(true);
  replacement.destroy();
  scanConnection.destroy();
  pool.close();
  expect(sockets.every((socket) => socket.readyState === 3)).toBe(true);
});

it.each([
  ['regtest', true],
  ['mainnet', false],
] as const)(
  'keeps idle connections silent when the deployment has not opted into mainnet checks',
  (network, fastElectrumStart) => {
    const pool = createStartupSockets({ ...makeGrant(), network, fastElectrumStart });
    pool.prepareElectrum();
    for (const socket of sockets) {
      socket.open();
      expect(socket.send).not.toHaveBeenCalled();
    }
    pool.close();
  },
);
