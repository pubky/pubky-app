import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalUserService } from '@/services/local/user/user';
import { nexusQueryClient } from '@/services/nexus/nexus.query-client';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { UserApplication } from './user';

const userId = 'pperrr8wsbpr3ue9d4qj41ge1kcc6r7fdiy6o3ugjrrhi4y77rdo';
const older: NexusUserDetails = {
  id: userId,
  name: 'Older profile',
  bio: 'Older bio',
  image: null,
  links: [],
  status: '',
  indexed_at: 1,
};
const newer: NexusUserDetails = {
  id: userId,
  name: 'Newer profile',
  bio: 'Newer bio',
  image: 'pubky://new-avatar',
  links: [{ title: 'Website', url: 'https://example.com' }],
  status: 'Available',
  indexed_at: 2,
};

// Keep the application, Nexus client, and Dexie persistence real; control only HTTP ordering.
describe('UserApplication concurrent details fetches', () => {
  beforeEach(() => nexusQueryClient.clear());
  afterEach(() => {
    nexusQueryClient.clear();
    vi.restoreAllMocks();
  });

  it.each([
    { profileFirst: true, newerFirst: true },
    { profileFirst: false, newerFirst: true },
    { profileFirst: true, newerFirst: false },
    { profileFirst: false, newerFirst: false },
  ])(
    'keeps the newer profile (profile first: $profileFirst, newer resolves first: $newerFirst)',
    async ({ profileFirst, newerFirst }) => {
      const responses: Array<(response: Response) => void> = [];
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => new Promise<Response>((resolve) => responses.push(resolve)));
      const first = UserApplication.fetchDetails({ userId, profileLookup: profileFirst });
      const second = UserApplication.fetchDetails({ userId, profileLookup: !profileFirst });

      expect(fetch).toHaveBeenCalledTimes(2);
      // The first request captured the older snapshot. Complete in either order.
      const firstToFinish = newerFirst ? second : first;
      responses[newerFirst ? 1 : 0](new Response(JSON.stringify(newerFirst ? newer : older)));
      expect(await firstToFinish).toMatchObject(newerFirst ? newer : older);

      responses[newerFirst ? 0 : 1](new Response(JSON.stringify(newerFirst ? older : newer)));
      expect(await (newerFirst ? first : second)).toMatchObject(newer);
      expect(await LocalUserService.readDetails({ userId })).toMatchObject(newer);
    },
  );
});
