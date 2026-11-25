// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { type BrowserApis, createBrowserCoordination } from './browserCoordination';
import type { CoordinationMessage } from './runtime.types';

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

    expect(locked).toEqual(['lock']);
    expect(ran).toEqual(['task']);
    expect(opened).toHaveLength(1);
    expect(posted).toEqual([message]);
    expect(heard).toEqual([message]);
  });
});
