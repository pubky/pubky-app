import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchRelayAcks } from './relay-ack-watch';

const RELAY = 'https://httprelay.example.com/inbox';

describe('watchRelayAcks', () => {
  let network: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    network = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', network);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports an ACK the SDK sends as a DELETE Request to a channel under the relay', async () => {
    const acks = watchRelayAcks(RELAY);
    expect(acks.sent()).toBe(false);

    await fetch(new Request(`${RELAY}/channel-1`, { method: 'GET' }));
    expect(acks.sent()).toBe(false);

    const request = new Request(`${RELAY}/channel-1`, { method: 'DELETE' });
    await fetch(request);
    expect(acks.sent()).toBe(true);
    expect(network).toHaveBeenLastCalledWith(request, undefined);
    acks.stop();
  });

  it('matches string and URL inputs with a DELETE init, and a relay given with a trailing slash', async () => {
    const fromString = watchRelayAcks(`${RELAY}/`);
    await fetch(`${RELAY}/channel-2`, { method: 'delete' });
    expect(fromString.sent()).toBe(true);
    fromString.stop();

    const fromUrl = watchRelayAcks(RELAY);
    await fetch(new URL(`${RELAY}/channel-3`), { method: 'DELETE' });
    expect(fromUrl.sent()).toBe(true);
    fromUrl.stop();
  });

  it('ignores DELETEs outside the relay inbox', async () => {
    const acks = watchRelayAcks(RELAY);
    await fetch('https://httprelay.example.com/link/channel', { method: 'DELETE' });
    await fetch('https://homeserver.example.com/pub/app/file', { method: 'DELETE' });
    await fetch(`${RELAY}-other/channel`, { method: 'DELETE' });
    expect(acks.sent()).toBe(false);
    acks.stop();
  });

  it('stays set after the ACK and restores the original fetch once the last watch stops', async () => {
    const first = watchRelayAcks(RELAY);
    const second = watchRelayAcks(RELAY);
    expect(globalThis.fetch).not.toBe(network);

    await fetch(`${RELAY}/channel`, { method: 'DELETE' });
    await fetch(`${RELAY}/channel`, { method: 'GET' });
    expect(first.sent()).toBe(true);
    expect(second.sent()).toBe(true);

    first.stop();
    expect(globalThis.fetch).not.toBe(network);
    second.stop();
    second.stop();
    expect(globalThis.fetch).toBe(network);
  });

  it('starts a fresh watch unset and re-wraps a fetch replaced in the meantime', async () => {
    const earlier = watchRelayAcks(RELAY);
    await fetch(`${RELAY}/channel`, { method: 'DELETE' });
    earlier.stop();

    const replaced = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', replaced);
    const later = watchRelayAcks(RELAY);
    expect(later.sent()).toBe(false);
    await fetch(`${RELAY}/channel`, { method: 'DELETE' });
    expect(later.sent()).toBe(true);
    expect(replaced).toHaveBeenCalledOnce();
    later.stop();
    expect(globalThis.fetch).toBe(replaced);
  });
});
