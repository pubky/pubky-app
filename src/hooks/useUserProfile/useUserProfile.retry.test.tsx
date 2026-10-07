import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserController } from '@/controllers/user/user';
import { useUserDetailsFromIds } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds';
import { nexusQueryClient } from '@/services/nexus/nexus.query-client';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { useUserProfile } from './useUserProfile';

const userId = 'pperrr8wsbpr3ue9d4qj41ge1kcc6r7fdiy6o3ugjrrhi4y77rdo';
const userIds = [userId];
const details: NexusUserDetails = {
  id: userId,
  name: 'Newly indexed user',
  bio: '',
  image: null,
  links: [],
  status: '',
  indexed_at: 1,
};

// Exercise the real hooks, controller, application, Dexie, and Nexus retry policy.
// Only HTTP responses are simulated; the server indexes this user after two seconds.
describe('user details retry scope', () => {
  beforeEach(() => nexusQueryClient.clear());
  afterEach(() => {
    nexusQueryClient.clear();
    vi.restoreAllMocks();
  });

  it('settles a missing profile lookup after three attempts', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('Not Found', { status: 404 }));
    const { result } = renderHook(() => useUserProfile(userId, { profileLookup: true }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3), { timeout: 3_000 });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.profile).toBeNull();
    expect(await UserController.getDetails({ userId })).toBeNull();
  }, 5_000);

  it('lets autocomplete hydrate a user indexed after the profile lookup budget', async () => {
    const startedAt = Date.now();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        Date.now() - startedAt < 2_000
          ? new Response('Not Found', { status: 404 })
          : new Response(JSON.stringify(details)),
      );
    const { result } = renderHook(() => useUserDetailsFromIds({ userIds }));

    await waitFor(() => expect(result.current.users).toHaveLength(1), { timeout: 6_000 });
    expect(result.current.users[0].name).toBe(details.name);
    expect(result.current.isLoading).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(await UserController.getDetails({ userId })).toMatchObject(details);
  }, 8_000);

  it('lets shared profile consumers hydrate a user indexed after the profile lookup budget', async () => {
    const startedAt = Date.now();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        Date.now() - startedAt < 2_000
          ? new Response('Not Found', { status: 404 })
          : new Response(JSON.stringify(details)),
      );
    const { result } = renderHook(() => useUserProfile(userId));

    await waitFor(() => expect(result.current.profile?.name).toBe(details.name), { timeout: 6_000 });
    expect(result.current.isLoading).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(await UserController.getDetails({ userId })).toMatchObject(details);
  }, 8_000);
});
