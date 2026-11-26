// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { type BrowserApis, createBrowserCoordination } from './browserCoordination';
import type { Coordination, CoordinationMessage } from './runtime.types';

/** One browser's locks and channels, shared by the tabs that call `apis`. */
function fakeBrowser() {
  const locks = new Map<string, Promise<void>>();
  const channels = new Map<string, Set<(data: unknown) => void>>();
  const requested: string[] = [];
  const apis = (): BrowserApis => ({
    requestLock: async (name, task) => {
      requested.push(name);
      const before = locks.get(name) ?? Promise.resolve();
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      locks.set(
        name,
        before.then(() => held),
      );
      await before;
      try {
        await task();
      } finally {
        release();
      }
    },
    openChannel: (name) => {
      const everyone = channels.get(name) ?? new Set<(data: unknown) => void>();
      channels.set(name, everyone);
      const own = new Set<(data: unknown) => void>();
      return {
        post: (message) => {
          for (const listener of everyone) if (!own.has(listener)) listener(message);
        },
        listen: (listener) => {
          own.add(listener);
          everyone.add(listener);
        },
      };
    },
  });
  return { apis, requested };
}

function coordinate(apis: BrowserApis, name: string): Coordination {
  const coordination = createBrowserCoordination(apis, name);
  if (coordination === null) throw new Error('expected coordination');
  return coordination;
}

describe('createBrowserCoordination', () => {
  it('is null without the browser APIs', () => {
    expect(createBrowserCoordination(null)).toBeNull();
  });

  it('locks through the lock API and talks over one channel, dropping stray messages', async () => {
    const locked: string[] = [];
    const opened: string[] = [];
    const posted: unknown[] = [];
    let deliver: (data: unknown) => void = () => undefined;
    const apis: BrowserApis = {
      requestLock: async (name, task) => {
        locked.push(name);
        await task();
      },
      openChannel: (name) => {
        opened.push(name);
        return {
          post: (message) => {
            posted.push(message);
          },
          listen: (listener) => {
            deliver = listener;
          },
        };
      },
    };
    const coordination = createBrowserCoordination(apis);
    if (coordination === null) throw new Error('expected coordination');
    const ran: string[] = [];

    await coordination.runExclusive('lock', async () => {
      ran.push('task');
    });
    const message: CoordinationMessage = { type: 'leader', seed: 'alice' };
    coordination.post(message);
    const heard: CoordinationMessage[] = [];
    const unsubscribe = coordination.subscribe((received) => heard.push(received));
    deliver(message);
    deliver({ type: 'other' });
    deliver('noise');
    deliver(null);
    unsubscribe();
    deliver(message);

    expect(locked).toEqual(['pubky-indexer/lock']);
    expect(ran).toEqual(['task']);
    expect(opened).toEqual(['pubky-indexer']);
    expect(posted).toEqual([message]);
    expect(heard).toEqual([message]);
  });

  it('keeps the locks and messages of two names apart', async () => {
    const browser = fakeBrowser();
    const alice = coordinate(browser.apis(), 'index-alice');
    const aliceTab = coordinate(browser.apis(), 'index-alice');
    const bob = coordinate(browser.apis(), 'index-bob');
    const ran: string[] = [];
    let releaseAlice: () => void = () => undefined;

    const aliceHolds = alice.runExclusive(
      'leader',
      () =>
        new Promise<void>((resolve) => {
          ran.push('alice');
          releaseAlice = resolve;
        }),
    );
    const aliceTabWaits = aliceTab.runExclusive('leader', async () => {
      ran.push('alice tab');
    });
    await bob.runExclusive('leader', async () => {
      ran.push('bob');
    });
    expect(ran).toEqual(['alice', 'bob']);
    releaseAlice();
    await Promise.all([aliceHolds, aliceTabWaits]);
    expect(ran).toEqual(['alice', 'bob', 'alice tab']);
    expect(browser.requested).toEqual(['index-alice/leader', 'index-alice/leader', 'index-bob/leader']);

    const heard = new Map<string, CoordinationMessage[]>([
      ['alice', []],
      ['alice tab', []],
      ['bob', []],
    ]);
    alice.subscribe((message) => heard.get('alice')?.push(message));
    aliceTab.subscribe((message) => heard.get('alice tab')?.push(message));
    bob.subscribe((message) => heard.get('bob')?.push(message));
    const message: CoordinationMessage = { type: 'leader', seed: 'alice' };
    alice.post(message);

    expect(heard).toEqual(
      new Map([
        ['alice', []],
        ['alice tab', [message]],
        ['bob', []],
      ]),
    );
  });

  it('hears a sync, and closes its channel so that it hears nothing after', () => {
    let closed = 0;
    let deliver: (data: unknown) => void = () => undefined;
    const apis: BrowserApis = {
      requestLock: async (_name, task) => task(),
      openChannel: () => ({
        post: () => undefined,
        listen: (listener) => {
          deliver = listener;
        },
        close: () => {
          closed += 1;
        },
      }),
    };
    const coordination = createBrowserCoordination(apis);
    if (coordination === null) throw new Error('expected coordination');
    const heard: CoordinationMessage[] = [];
    coordination.subscribe((message) => heard.push(message));
    const synced: CoordinationMessage = { type: 'synced', seed: 'alice', at: 1, bodiesPending: false };

    deliver(synced);
    coordination.close();
    deliver(synced);

    expect(closed).toBe(1);
    expect(heard).toEqual([synced]);
  });
});
