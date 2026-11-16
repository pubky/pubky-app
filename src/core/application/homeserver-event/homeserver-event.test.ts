import { describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { HomeserverEventApplication } from './homeserver-event';

vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: { subscribeUserEventStream: vi.fn() },
}));

describe('HomeserverEventApplication.subscribeUserEventStream', () => {
  it('opens one service subscription for the user, cursor, paths and signal', async () => {
    const stream = new ReadableStream();
    vi.mocked(HomeserverService.subscribeUserEventStream).mockResolvedValue(stream);
    const signal = new AbortController().signal;
    const paths = ['/pub/pubky.app/mutes/', '/pub/pubky.app/last_read'];

    await expect(
      HomeserverEventApplication.subscribeUserEventStream({ pubky: 'pubky-a' as Pubky, cursor: '12', paths, signal }),
    ).resolves.toBe(stream);

    expect(HomeserverService.subscribeUserEventStream).toHaveBeenCalledWith({
      userZ32: 'pubky-a',
      cursor: '12',
      paths,
      signal,
    });
  });
});
