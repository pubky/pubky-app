import { describe, expect, it, vi } from 'vitest';
import { prepareElectrumHandshake } from './electrum-handshake.mjs';

class Socket {
  readyState: number;
  binaryType = 'blob';
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: Event) => void) | null = null;
  onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  writes: string[] = [];
  constructor(ready = false) {
    this.readyState = ready ? 1 : 0;
  }
  send(data: Uint8Array) {
    this.writes.push(new TextDecoder().decode(data));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  answer(line: string) {
    this.onmessage?.({ data: Uint8Array.from(new TextEncoder().encode(line)).buffer });
  }
}

const genesis = '{"jsonrpc":"2.0","id":1,"method":"blockchain.block.header","params":[0]}\n';
const version = '{"jsonrpc":"2.0","method":"server.version","params":["beignet","1.4"],"id":1}\n';
const ping = '{"jsonrpc":"2.0","method":"server.ping","params":[],"id":2}\n';
const balance =
  '[{"jsonrpc":"2.0","method":"blockchain.scripthash.get_balance","params":["77ca78f9a84b48041ad71f7cc6ff6c33460c25f0cb99f558f9813ed9e63727dd"],"id":3}]\n';
const server = '{"jsonrpc":"2.0","result":["server","1.4"],"id":1}\n';
const pong = '{"jsonrpc":"2.0","result":null,"id":2}\n';
const amount = '[{"jsonrpc":"2.0","result":{"confirmed":7,"unconfirmed":0},"id":3}]\n';
const next = '{"jsonrpc":"2.0","method":"server.ping","params":[],"id":4}\n';
const encode = (line: string) => new TextEncoder().encode(line);

function fixture(role: string, ready = false) {
  const raw = new Socket(ready);
  const fresh = new Socket();
  const abandon = vi.fn();
  const dial = vi.fn(() => fresh);
  const pre = prepareElectrumHandshake(raw, role, abandon, dial);
  const messages: string[] = [];
  const connected = vi.fn(),
    failed = vi.fn(),
    closed = vi.fn();
  const claim = () => {
    const app = pre.claim();
    Object.assign(app, {
      onopen: connected,
      onerror: failed,
      onclose: closed,
      onmessage: (e: { data: ArrayBuffer }) => messages.push(new TextDecoder().decode(e.data)),
    });
    return app;
  };
  return { raw, fresh, abandon, dial, pre, messages, connected, failed, closed, claim };
}

describe('same-socket Electrum startup handshake', () => {
  it.each(['{"id":1,"result":"wrong-genesis"}\n', '{"id":1,"error":{"code":1,"message":"refused"}}\n'])(
    'leaves genesis results and errors for engine validation',
    async (answer) => {
      const f = fixture('genesis', true);
      expect(f.raw.binaryType).toBe('arraybuffer');
      expect(f.raw.writes).toEqual([genesis]);
      f.raw.answer(answer.slice(0, 8));
      f.raw.answer(answer.slice(8));
      const app = f.claim();
      await Promise.resolve();
      expect(f.connected).toHaveBeenCalledTimes(1);
      expect(f.messages).toEqual([]);
      app.send(encode(genesis));
      await Promise.resolve();
      expect(f.messages).toEqual([answer]);
      expect(f.raw.writes).toEqual([genesis]);
      expect(f.dial).not.toHaveBeenCalled();
      app.close();
      expect(f.raw.readyState).toBe(3);
    },
  );

  it('preserves version, ping and public balance reply bytes even when coalesced, split and reordered', async () => {
    const f = fixture('session');
    const app = f.claim();
    expect(f.connected).not.toHaveBeenCalled();
    f.raw.open();
    expect(f.connected).toHaveBeenCalledTimes(1);
    expect(f.raw.writes).toEqual([version]);
    f.raw.answer(server);
    expect(f.raw.writes).toEqual([version, ping + balance]);
    f.raw.answer(amount + pong.slice(0, 5));
    f.raw.answer(pong.slice(5));
    expect(f.messages).toEqual([]);
    app.send(encode(version));
    await Promise.resolve();
    expect(f.messages).toEqual([server]);
    app.send(encode(ping));
    await Promise.resolve();
    expect(f.messages).toEqual([server, pong]);
    app.send(encode(balance));
    await Promise.resolve();
    expect(f.messages).toEqual([server, pong, amount]);
    app.send(encode(next));
    f.raw.answer('{"id":4,"result":null}\n');
    expect(f.raw.writes).toEqual([version, ping + balance, next]);
    expect(f.messages.at(-1)).toBe('{"id":4,"result":null}\n');
  });

  it('uses a fresh stream and preserves write order on a first-request mismatch', async () => {
    const f = fixture('session', true);
    f.raw.answer(server);
    const app = f.claim();
    await Promise.resolve();
    app.send(encode(next));
    app.send(encode(ping));
    expect(app.readyState).toBe(1);
    expect(f.raw.readyState).toBe(3);
    f.fresh.open();
    expect(f.fresh.writes).toEqual([next, ping]);
    expect(f.messages).toEqual([]);
    expect(f.connected).toHaveBeenCalledTimes(1);
    app.close();
  });

  it('replays matched but undelivered writes after an invalid reply after claim', async () => {
    const f = fixture('genesis', true);
    const app = f.claim();
    await Promise.resolve();
    app.send(encode(genesis));
    f.raw.answer('{"id":7,"result":"wrong reply"}\n');
    f.fresh.open();
    expect(f.fresh.writes).toEqual([genesis]);
    expect(f.messages).toEqual([]);
    f.fresh.answer('{"id":1,"result":"actual"}\n');
    expect(f.messages).toEqual(['{"id":1,"result":"actual"}\n']);
    app.close();
  });

  it('drains outstanding public probes before forwarding a changed request on the negotiated stream', async () => {
    const f = fixture('session', true);
    const app = f.claim();
    app.send(encode(version));
    f.raw.answer(server);
    expect(f.messages).toEqual([server]);
    app.send(encode(next));
    app.send(encode(balance));
    f.raw.answer(amount);
    expect(f.raw.writes).toEqual([version, ping + balance]);
    f.raw.answer(pong);
    expect(f.raw.writes).toEqual([version, ping + balance, next, balance]);
    expect(f.messages).toEqual([server]);
    expect(f.dial).not.toHaveBeenCalled();
    f.raw.answer(amount);
    expect(f.messages).toEqual([server, amount]);
    app.close();
  });

  it('delivers only already matched replies once when a later write diverges', async () => {
    const f = fixture('session', true);
    const app = f.claim();
    app.send(encode(version));
    f.raw.answer(server);
    app.send(encode(ping));
    app.send(encode(next));
    f.raw.answer(amount + pong);
    await Promise.resolve();
    expect(f.messages).toEqual([server, pong]);
    expect(f.raw.writes).toEqual([version, ping + balance, next]);
    expect(f.dial).not.toHaveBeenCalled();
    app.close();
  });

  it('times out both claimed silent streams and stalled drains', async () => {
    vi.useFakeTimers();
    try {
      const cold = fixture('genesis', true);
      const pending = cold.claim();
      pending.send(encode(genesis));
      const f = fixture('session', true);
      const app = f.claim();
      app.send(encode(version));
      f.raw.answer(server);
      app.send(encode(next));
      f.raw.answer(pong);
      await vi.advanceTimersByTimeAsync(5000);
      for (const item of [cold, f]) {
        expect(item.raw.readyState).toBe(3);
        expect(item.failed).toHaveBeenCalledOnce();
        expect(item.closed).toHaveBeenCalledOnce();
      }
      expect(f.raw.writes).toEqual([version, ping + balance]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes a negotiated stream on invalid data while draining', () => {
    const f = fixture('session', true);
    const app = f.claim();
    app.send(encode(version));
    f.raw.answer(server);
    app.send(encode(next));
    f.raw.answer('{"id":8,"result":true}\n');
    expect(f.raw.readyState).toBe(3);
    expect(f.failed).toHaveBeenCalledOnce();
    expect(f.dial).not.toHaveBeenCalled();
  });

  it('delivers negotiation errors and leaves future requests to the engine', async () => {
    const f = fixture('session', true);
    const answer = '{"id":1,"error":{"code":2}}\n';
    f.raw.answer(answer);
    const app = f.claim();
    app.send(encode(version));
    await Promise.resolve();
    expect(f.messages).toEqual([answer]);
    expect(f.raw.writes).toEqual([version]);
  });

  it.each([
    'a'.repeat(4097),
    'unparseable\n',
    '{"id":1,"result":null}\nextra',
    '[{"id":1,"result":null}]\n',
    '{"id":1,"method":"unexpected"}\n',
  ])('discards unusable idle traffic before claim', (reply) => {
    const f = fixture('genesis', true);
    f.raw.answer(reply);
    expect(f.abandon).toHaveBeenCalledOnce();
    expect(f.dial).not.toHaveBeenCalled();
    expect(f.raw.readyState).toBe(3);
    expect(f.claim).toThrow();
  });

  it('detaches cancelled probes, and propagates claimed upstream errors and close', () => {
    const f = fixture('session');
    f.pre.cancel();
    f.raw.open();
    expect(f.raw.writes).toEqual([]);
    const g = fixture('session');
    g.claim();
    g.raw.onerror?.(new Event('error'));
    g.raw.onclose?.(new Event('close'));
    expect(g.failed).toHaveBeenCalledOnce();
    expect(g.closed).toHaveBeenCalledOnce();
    expect(g.dial).not.toHaveBeenCalled();
  });
});
