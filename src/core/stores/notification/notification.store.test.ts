import { beforeEach, describe, expect, it } from 'vitest';
import { useNotificationStore } from './notification.store';

describe('NotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.getState().reset();
  });

  it('initializes with default values', () => {
    const state = useNotificationStore.getState();
    expect(state.lastRead).toBe(0);
    expect(state.unread).toBe(0);
  });

  it('sets and gets lastRead timestamp', () => {
    const store = useNotificationStore.getState();
    const timestamp = Date.now();

    store.setLastRead(timestamp);
    expect(store.selectLastRead()).toBe(timestamp);
  });

  it('sets and gets unread count', () => {
    const store = useNotificationStore.getState();

    store.setUnread(5);
    expect(store.selectUnread()).toBe(5);
  });

  it('prevents negative unread count', () => {
    const store = useNotificationStore.getState();

    store.setUnread(-5);
    expect(store.selectUnread()).toBe(0);
  });

  it('resets to initial state', () => {
    const store = useNotificationStore.getState();

    store.setLastRead(123456);
    store.setUnread(5);
    store.reset();

    expect(store.selectLastRead()).toBe(0);
    expect(store.selectUnread()).toBe(0);
  });
});
