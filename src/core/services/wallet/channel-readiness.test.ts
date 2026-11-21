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
  const watcher = { recheckAllWatches: vi.fn() };
  const node = Object.assign(new EventEmitter(), {
    getChannelManager: () => manager,
    getChainWatcher: vi.fn((): typeof watcher | null => watcher),
    recoveryPermitsPeerTraffic: vi.fn(() => true),
  });
  const extension = primaryChannelReadiness(primary, onUsable);
  const attachment = extension.attach();
  attachment.bind(node);
  return { id, other, channel, manager, node, watcher, extension, attachment, onUsable };
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

it('wakes the chain watcher once per live missing-funding episode without changing the hold', () => {
  const { id, extension, attachment, watcher } = fixture();
  const held = Object.freeze({ channelId: id.toString('hex'), state: 'NORMAL', fundingUnaccounted: true });
  const observe = (row: unknown) => extension.observeFunding([row]);
  observe(held);
  attachment.start();
  for (const state of ['CLOSED', 'FORCE_CLOSED', 'DROPPED']) observe({ ...held, state });
  observe({ ...held, fundingUnaccounted: false, restoreRecencyUnproven: true });
  extension.observeFunding(null);
  observe({ state: 'NORMAL', fundingUnaccounted: true });
  expect(watcher.recheckAllWatches).not.toHaveBeenCalled();
  observe(held);
  observe(held);
  expect(watcher.recheckAllWatches).toHaveBeenCalledTimes(1);
  observe({ ...held, fundingUnaccounted: false });
  observe(held);
  expect(watcher.recheckAllWatches).toHaveBeenCalledTimes(2);
  attachment.stop();
  extension.observeFunding([]);
  observe(held);
  expect(watcher.recheckAllWatches).toHaveBeenCalledTimes(2);
});

it('waits for an available watcher and live ownership, and leaves a failed recheck to the engine', () => {
  const { id, node, watcher, extension, attachment } = fixture();
  const rows = [{ channelId: id.toString('hex'), state: 'AWAITING_REESTABLISH', fundingUnaccounted: true }];
  attachment.start();
  node.getChainWatcher.mockReturnValueOnce(null);
  extension.observeFunding(rows);
  node.recoveryPermitsPeerTraffic.mockReturnValueOnce(false);
  extension.observeFunding(rows);
  expect(watcher.recheckAllWatches).not.toHaveBeenCalled();
  watcher.recheckAllWatches.mockImplementationOnce(() => {
    throw new Error('chain read failed');
  });
  extension.observeFunding(rows);
  extension.observeFunding(rows);
  expect(watcher.recheckAllWatches).toHaveBeenCalledTimes(1);
  attachment.stop();
});
