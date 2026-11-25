import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdbStore } from '@/libs/indexer/idbStore';
import { createSocialIndexer } from '@/libs/indexer/social/socialIndexer';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { postStreamDirtyRegistry } from '@/services/local/stream/posts/postStreamDirtyRegistry';
import { IndexerService } from './indexer';

const fakes = vi.hoisted(() => ({
  indexers: [] as Array<{
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    change: () => void;
  }>,
  writeListeners: new Set<(path: string) => void>(),
  stores: [] as Array<{ name: string; close: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }>,
}));

vi.mock('@/libs/indexer/idbStore', () => ({
  createIdbStore: vi.fn((name: string) => {
    const store = { name, close: vi.fn(), destroy: vi.fn().mockResolvedValue(undefined) };
    fakes.stores.push(store);
    return store;
  }),
}));
vi.mock('@/libs/indexer/social/socialIndexer', () => ({
  createSocialIndexer: vi.fn(() => {
    const listeners = new Set<() => void>();
    const indexer = {
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      refresh: vi.fn().mockResolvedValue(undefined),
      onChange: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      change: () => {
        for (const listener of listeners) listener();
      },
    };
    fakes.indexers.push(indexer);
    return indexer;
  }),
}));
vi.mock('@/libs/indexer/browserCoordination', () => ({ createBrowserCoordination: () => null }));
vi.mock('./indexer.transport', () => ({ createIndexerTransport: vi.fn(() => ({})) }));
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    subscribeOwnedWrites: vi.fn((listener: (path: string) => void) => {
      fakes.writeListeners.add(listener);
      return () => fakes.writeListeners.delete(listener);
    }),
  },
}));

const write = (path: string) => {
  for (const listener of fakes.writeListeners) listener(path);
};

const ALICE = 'alice-pubky' as Pubky;
const BOB = 'bob-pubky' as Pubky;

describe('IndexerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.indexers.length = 0;
    fakes.stores.length = 0;
    fakes.writeListeners.clear();
  });

  afterEach(() => {
    IndexerService.stop();
  });

  it('runs one index per tab, in a database named by the account, seeded with it', () => {
    IndexerService.start(ALICE);
    IndexerService.start(ALICE);

    expect(createSocialIndexer).toHaveBeenCalledOnce();
    expect(createIdbStore).toHaveBeenCalledWith(`pubky-index-${ALICE}`);
    expect(fakes.indexers[0].start).toHaveBeenCalledExactlyOnceWith(ALICE);
    expect(IndexerService.current()).toBe(fakes.indexers[0]);
  });

  it('refreshes the account after each of its public writes, until it stops', () => {
    IndexerService.start(ALICE);

    write('/pub/social/v1/posts/0033');
    write('/priv/app.pubky/v1/settings.json');
    IndexerService.stop();
    write('/pub/social/v1/posts/0034');

    expect(HomeserverService.subscribeOwnedWrites).toHaveBeenCalledOnce();
    expect(fakes.indexers[0].refresh).toHaveBeenCalledExactlyOnceWith([ALICE]);
  });

  it('marks every cached post stream dirty when the index changes, until it stops', () => {
    postStreamDirtyRegistry.reset();
    IndexerService.start(ALICE);
    expect(postStreamDirtyRegistry.isDirty('timeline:all:all')).toBe(false);

    fakes.indexers[0].change();
    expect(postStreamDirtyRegistry.isDirty('timeline:all:all')).toBe(true);

    postStreamDirtyRegistry.markReconciled('timeline:all:all');
    IndexerService.stop();
    fakes.indexers[0].change();
    expect(postStreamDirtyRegistry.isDirty('timeline:all:all')).toBe(false);
    postStreamDirtyRegistry.reset();
  });

  it('stops the previous account’s index before starting another', () => {
    IndexerService.start(ALICE);
    IndexerService.start(BOB);

    expect(fakes.indexers[0].stop).toHaveBeenCalledOnce();
    expect(fakes.stores[0].close).toHaveBeenCalledOnce();
    expect(fakes.indexers[1].start).toHaveBeenCalledExactlyOnceWith(BOB);
    expect(IndexerService.current()).toBe(fakes.indexers[1]);
  });

  it('keeps the database on stop and runs nothing afterwards', () => {
    IndexerService.start(ALICE);
    IndexerService.stop();

    expect(fakes.indexers[0].stop).toHaveBeenCalledOnce();
    expect(fakes.stores[0].destroy).not.toHaveBeenCalled();
    expect(IndexerService.current()).toBeNull();
  });

  it('stops the running index and deletes its database on clear', async () => {
    IndexerService.start(ALICE);

    await IndexerService.clear(ALICE);

    expect(fakes.indexers[0].stop).toHaveBeenCalledOnce();
    expect(fakes.stores.at(-1)).toMatchObject({ name: `pubky-index-${ALICE}` });
    expect(fakes.stores.at(-1)?.destroy).toHaveBeenCalledOnce();
    expect(IndexerService.current()).toBeNull();
  });

  it('deletes the media cache of the service worker with the database', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: { delete: deleteCache } });
    try {
      await IndexerService.clear(ALICE);
    } finally {
      Reflect.deleteProperty(globalThis, 'caches');
    }

    expect(deleteCache).toHaveBeenCalledExactlyOnceWith('pubky-local-media');
  });

  it('deletes another account’s database without touching the running index', async () => {
    IndexerService.start(ALICE);

    await IndexerService.clear(BOB);

    expect(fakes.indexers[0].stop).not.toHaveBeenCalled();
    expect(fakes.stores.at(-1)).toMatchObject({ name: `pubky-index-${BOB}` });
    expect(IndexerService.current()).toBe(fakes.indexers[0]);
  });
});
