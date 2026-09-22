import type { PubkyAppUser } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileApplication } from '@/application/profile/profile';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalProfileService } from '@/services/local/profile/profile';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { LocalUserService } from '@/services/local/user/user';
import { nexusQueryClient } from '@/services/nexus/nexus.query-client';
import type { NexusUser, NexusUserDetails } from '@/services/nexus/nexus.types';
import { asOpaque } from '@/test-utils/type-assertions';
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

const fullUser = (details: NexusUserDetails): NexusUser => ({
  details,
  counts: {
    tagged: 0,
    tags: 0,
    unique_tags: 0,
    posts: 0,
    replies: 0,
    following: 0,
    followers: 0,
    friends: 0,
    collections: 0,
    bookmarks: 0,
  },
  tags: [],
  relationship: { following: false, followed_by: false },
});

const localEdit = asOpaque<PubkyAppUser>({
  name: 'Local edit',
  bio: '',
  image: null,
  links: [],
});

// Keep the application, Nexus client, and Dexie persistence real; control network responses and time.
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

  it('accepts a newer server edit from a retry started after a local edit with an ahead client clock', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(60_000);
    let respond!: (response: Response) => void;
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );
    expect(await LocalUserService.readDetails({ userId })).toBeNull();
    const pending = UserApplication.fetchDetails({ userId });
    expect(fetch).toHaveBeenCalledTimes(1);

    // A concurrent full-user hydration makes the profile editable while the miss request waits.
    await LocalStreamUsersService.persistUsers([fullUser(older)]);
    clock.mockReturnValue(61_000);
    vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    await ProfileApplication.commitUpdate({ pubky: userId, name: 'Local edit', bio: '', image: null, links: [] });
    expect(await LocalUserService.readDetails({ userId })).toMatchObject({ name: 'Local edit', indexed_at: 61_000 });

    clock.mockReturnValue(61_500);
    fetch.mockResolvedValue(new Response(JSON.stringify(newer)));
    respond(new Response('Not Found', { status: 404 }));

    expect(await pending).toMatchObject(newer);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await LocalUserService.readDetails({ userId })).toMatchObject(newer);
    expect((await UserDetailsModel.findById(userId))?.localUpdatedAt).toBeUndefined();
  });

  it('keeps a local edit when an earlier request finishes, even with an ahead server clock', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(60_000);
    let respond!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );
    const pending = UserApplication.fetchDetails({ userId });
    await LocalStreamUsersService.persistUsers([fullUser(older)]);
    clock.mockReturnValue(61_000);
    await LocalProfileService.updateDetails(localEdit, userId);

    respond(new Response(JSON.stringify({ ...newer, indexed_at: 120_000 })));

    expect(await pending).toMatchObject({ name: 'Local edit', indexed_at: 61_000 });
    expect(await UserTtlModel.findById(userId)).toMatchObject({ lastUpdatedAt: 61_000 });
  });

  it.each([0, 1])('keeps a local edit when a later request still returns server revision %s', async (indexedAt) => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(60_000);
    await LocalStreamUsersService.persistUsers([fullUser(older)]);
    await LocalProfileService.updateDetails(localEdit, userId);
    clock.mockReturnValue(61_000);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ...older, indexed_at: indexedAt })));

    expect(await UserApplication.fetchDetails({ userId })).toMatchObject({ name: 'Local edit', indexed_at: 60_000 });
  });

  it('accepts server data over a legacy row whose indexed_at may be client time', async () => {
    await UserDetailsModel.upsert({ ...older, name: 'Legacy local edit', indexed_at: 61_000 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(newer)));

    expect(await UserApplication.fetchDetails({ userId })).toMatchObject(newer);
  });

  it('keeps a newer revision hydrated by a full-user response', async () => {
    let respond!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );
    const pending = UserApplication.fetchDetails({ userId });
    await LocalStreamUsersService.persistUsers([fullUser(newer)]);
    respond(new Response(JSON.stringify(older)));

    expect(await pending).toMatchObject(newer);
  });
});
