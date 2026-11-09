import { describe, expect, it, vi } from 'vitest';
import { HomeserverEventApplication } from '@/application/homeserver-event/homeserver-event';
import type { Pubky } from '@/models/models.types';
import { HomeserverEventController } from './homeserver-event';

vi.mock('@/application/homeserver-event/homeserver-event', () => ({
  HomeserverEventApplication: { subscribeUserEventStream: vi.fn() },
}));

describe('HomeserverEventController.subscribeUserEventStream', () => {
  it('returns the application stream for the same parameters', async () => {
    const stream = new ReadableStream();
    vi.mocked(HomeserverEventApplication.subscribeUserEventStream).mockResolvedValue(stream);
    const params = {
      pubky: 'pubky-a' as Pubky,
      cursor: null,
      paths: ['/pub/pubky.app/last_read'],
      signal: new AbortController().signal,
    };

    await expect(HomeserverEventController.subscribeUserEventStream(params)).resolves.toBe(stream);
    expect(HomeserverEventApplication.subscribeUserEventStream).toHaveBeenCalledWith(params);
  });
});
