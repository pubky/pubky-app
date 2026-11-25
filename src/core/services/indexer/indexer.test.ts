import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type BrowserCoordination, createBrowserCoordination } from '@/libs/indexer/browserCoordination';
import { createIdbStore } from '@/libs/indexer/idbStore';
import { createSocialIndexer, type SocialChange } from '@/libs/indexer/social/socialIndexer';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { postStreamDirtyRegistry } from '@/services/local/stream/posts/postStreamDirtyRegistry';
import { asOpaque } from '@/test-utils/type-assertions';
import { IndexerService } from './indexer';

const fakes = vi.hoisted(() => ({
  indexers: [] as Array<{
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    change: (change: SocialChange) => void;
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
    const listeners = new Set<(change: SocialChange) => void>();
    const indexer = {
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      refresh: vi.fn().mockResolvedValue(undefined),
      onChange: (listener: (change: SocialChange) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      change: (change: SocialChange) => {
        for (const listener of listeners) listener(change);
      },
    };
    fakes.indexers.push(indexer);
    return indexer;
  }),
}));
vi.mock('@/libs/indexer/browserCoordination', () => ({
  browserApis: () => null,
  createBrowserCoordination: vi.fn(() => null),
}));
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
    expect(createBrowserCoordination).toHaveBeenCalledWith(null, `pubky-index-${ALICE}`);
    expect(fakes.indexers[0].start).toHaveBeenCalledExactlyOnceWith(ALICE);
    expect(IndexerService.current()).toBe(fakes.indexers[0]);
  });

  it('runs a visitor’s index in its own database, with no tab coordination and no write refresh', () => {
    IndexerService.start(null);
    IndexerService.start(null);

    expect(createSocialIndexer).toHaveBeenCalledOnce();
    expect(createIdbStore).toHaveBeenCalledWith('pubky-index-visitor');
    expect(createBrowserCoordination).not.toHaveBeenCalled();
    expect(HomeserverService.subscribeOwnedWrites).not.toHaveBeenCalled();
    expect(fakes.indexers[0].start).toHaveBeenCalledExactlyOnceWith(null);
    expect(IndexerService.current()).toBe(fakes.indexers[0]);
  });

  it('stops the visitor’s index and deletes its database when an account starts', () => {
    IndexerService.start(null);
    IndexerService.start(ALICE);

    expect(fakes.indexers[0].stop).toHaveBeenCalledOnce();
    const visitorStores = fakes.stores.filter((store) => store.name === 'pubky-index-visitor');
    expect(visitorStores.some((store) => store.destroy.mock.calls.length === 1)).toBe(true);
    expect(fakes.indexers[1].start).toHaveBeenCalledExactlyOnceWith(ALICE);
  });

  it('keeps the account’s database when a visitor’s index follows it', () => {
    IndexerService.start(ALICE);
    IndexerService.start(null);

    expect(fakes.indexers[0].stop).toHaveBeenCalledOnce();
    expect(fakes.stores.every((store) => store.destroy.mock.calls.length === 0)).toBe(true);
    expect(fakes.indexers[1].start).toHaveBeenCalledExactlyOnceWith(null);
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

  describe('post stream invalidation', () => {
    const ALL = 'timeline:all:all';
    const FOLLOWING = 'timeline:following:all';
    const FRIENDS = 'timeline:friends:all';
    const change = (...kinds: SocialChange['kinds']): SocialChange => ({
      authors: [BOB],
      membersChanged: false,
      kinds,
    });

    beforeEach(() => {
      postStreamDirtyRegistry.reset();
      IndexerService.start(ALICE);
    });

    afterEach(() => {
      postStreamDirtyRegistry.reset();
    });

    it('marks every cached post stream dirty when posts or tags change, until it stops', () => {
      expect(postStreamDirtyRegistry.isDirty(ALL)).toBe(false);

      fakes.indexers[0].change(change('activity'));
      expect(postStreamDirtyRegistry.isDirty(ALL)).toBe(true);
      expect(postStreamDirtyRegistry.isDirty(FOLLOWING)).toBe(true);

      postStreamDirtyRegistry.markReconciled(ALL);
      IndexerService.stop();
      fakes.indexers[0].change(change('activity'));
      expect(postStreamDirtyRegistry.isDirty(ALL)).toBe(false);
    });

    it('marks only the streams that follow the graph when only follows change', () => {
      fakes.indexers[0].change(change('graph'));

      expect(postStreamDirtyRegistry.isDirty(FOLLOWING)).toBe(true);
      expect(postStreamDirtyRegistry.isDirty(FRIENDS)).toBe(true);
      expect(postStreamDirtyRegistry.isDirty(ALL)).toBe(false);
    });

    it('marks no post stream when only a profile changes', () => {
      fakes.indexers[0].change(change('profile'));

      expect(postStreamDirtyRegistry.isDirty(ALL)).toBe(false);
      expect(postStreamDirtyRegistry.isDirty(FOLLOWING)).toBe(false);
    });
  });

  it('stops the previous account’s index before starting another', () => {
    IndexerService.start(ALICE);
    IndexerService.start(BOB);

    expect(fakes.indexers[0].stop).toHaveBeenCalledOnce();
    expect(fakes.stores[0].close).toHaveBeenCalledOnce();
    expect(fakes.indexers[1].start).toHaveBeenCalledExactlyOnceWith(BOB);
    expect(IndexerService.current()).toBe(fakes.indexers[1]);
  });

  it('closes the tab coordination after the index stops', () => {
    const close = vi.fn();
    vi.mocked(createBrowserCoordination).mockReturnValueOnce(asOpaque<BrowserCoordination>({ close }));
    IndexerService.start(ALICE);
    expect(close).not.toHaveBeenCalled();

    IndexerService.stop();

    expect(close).toHaveBeenCalledOnce();
    expect(fakes.indexers[0].stop.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]);
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
