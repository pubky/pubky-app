// @vitest-environment node
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { primaryChannelReadiness } from './channel-readiness.mjs';

function fixture(onUsable = vi.fn()) {
  const primary = 'primary';
  const id = Buffer.alloc(32, 1);
  const other = Buffer.alloc(32, 2);
  const channel = { acceptsNewHtlcs: vi.fn(() => false), getChannelId: () => id };
  const manager = Object.assign(new EventEmitter(), {
    getChannelsByPeer: () => [channel],
    getPeerForChannel: (key: Buffer) => (key.equals(id) ? primary : 'other'),
    getChannel: (key: Buffer) => (key.equals(id) ? channel : { acceptsNewHtlcs: (): boolean => true }),
  });
  const node = Object.assign(new EventEmitter(), { getChannelManager: () => manager });
  const attachment = primaryChannelReadiness(primary, onUsable).attach();
  attachment.bind(node);
  return { id, other, channel, manager, node, attachment, onUsable };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('waits for the primary channel to accept new HTLCs after reestablishment, then coalesces hints', () => {
  const { attachment, node, manager, channel, id, other, onUsable } = fixture();
  attachment.start();
  node.emit('peer:connect', 'primary');
  manager.emit('channel:reestablished', id);
  vi.runAllTimers();
  expect(onUsable).not.toHaveBeenCalled();

  channel.acceptsNewHtlcs.mockReturnValue(true);
  manager.emit('channel:reestablished', other);
  vi.runAllTimers();
  expect(onUsable).not.toHaveBeenCalled();

  manager.emit('channel:reestablished', id);
  node.emit('channel:ready', { channelId: id });
  node.emit('splice:complete', { channelId: id });
  expect(onUsable).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(onUsable.mock.calls).toEqual([[]]);
});

it('checks a channel already established before extension startup and releases its listeners on rebuild', () => {
  const { attachment, node, manager, channel, id, onUsable } = fixture();
  channel.acceptsNewHtlcs.mockReturnValue(true);
  attachment.start();
  vi.runAllTimers();
  expect(onUsable).toHaveBeenCalledOnce();

  node.emit('splice:reverted', { channelId: id });
  attachment.stop();
  expect(node.eventNames()).toEqual([]);
  expect(manager.eventNames()).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
  const replacement = fixture(onUsable);
  replacement.attachment.start();
  vi.runAllTimers();
  expect(onUsable).toHaveBeenCalledOnce();
});
