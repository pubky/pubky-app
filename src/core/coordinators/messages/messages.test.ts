import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagesController } from '@/controllers/messages/messages';
import { useMessagesStore } from '@/stores/messages/messages.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { MessagesCoordinator } from './messages';

const PEER = 'wnpkm7d4c7caym93kzhpamjkn11hu8jdz4m9o3y1x9huopniwuay';

/** Runs one tick directly; the base class owns timers, routes and visibility. */
async function tick(coordinator: MessagesCoordinator) {
  await asOpaque<{ poll: () => Promise<void> }>(coordinator).poll();
}

describe('MessagesCoordinator', () => {
  let coordinator: MessagesCoordinator;

  beforeEach(() => {
    useMessagesStore.getState().reset();
    vi.spyOn(MessagesController, 'fetchStatus').mockImplementation(async () => {});
    vi.spyOn(MessagesController, 'fetchConversation').mockResolvedValue(0);
    vi.spyOn(MessagesController, 'fetchConversations').mockResolvedValue();
    vi.spyOn(MessagesController, 'fetchDiscovery').mockResolvedValue();
    coordinator = MessagesCoordinator.getInstance();
  });

  afterEach(() => {
    MessagesCoordinator.resetInstance();
    vi.restoreAllMocks();
  });

  it('checks the status and does nothing else while Messages is locked', async () => {
    await tick(coordinator);
    expect(MessagesController.fetchStatus).toHaveBeenCalledOnce();
    expect(MessagesController.fetchConversations).not.toHaveBeenCalled();
    expect(MessagesController.fetchDiscovery).not.toHaveBeenCalled();
  });

  it('syncs every conversation and discovers on the first tick after Messages becomes ready', async () => {
    vi.mocked(MessagesController.fetchStatus).mockImplementation(async () => {
      useMessagesStore.getState().setStatus('ready');
    });
    await tick(coordinator);
    expect(MessagesController.fetchConversations).toHaveBeenCalledOnce();
    expect(MessagesController.fetchDiscovery).toHaveBeenCalledOnce();

    await tick(coordinator);
    expect(MessagesController.fetchConversations).toHaveBeenCalledOnce();
    expect(MessagesController.fetchDiscovery).toHaveBeenCalledOnce();
  });

  it('checks the open conversation on every ready tick', async () => {
    useMessagesStore.getState().setStatus('ready');
    useMessagesStore.getState().setActivePeer(PEER);
    await tick(coordinator);
    await tick(coordinator);
    expect(MessagesController.fetchConversation).toHaveBeenCalledTimes(2);
    expect(MessagesController.fetchConversation).toHaveBeenCalledWith(PEER);
  });
});
