import type { GrantSession } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { mockSession } from '@/test-utils/pubky';
import { asOpaque } from '@/test-utils/type-assertions';
import { HomeserverService } from './homeserver';

vi.mock('pubky-app-specs', () => ({
  default: vi.fn(),
  userUriBuilder: (key: string) => `pubky://${key}/pub/pubky.app/profile.json`,
}));

const DATA = { aud: 'pubky-moderation', method: 'GET', path: '/v1/decisions' };

describe('HomeserverService.createCustomPop', () => {
  beforeEach(() => {
    useAuthStore.setState(authInitialState);
  });

  afterEach(() => {
    useAuthStore.setState(authInitialState);
    vi.restoreAllMocks();
  });

  it('is null when nobody is signed in', async () => {
    await expect(HomeserverService.createCustomPop(DATA)).resolves.toBeNull();
  });

  it('is null for a session that has no grant, such as a restored cookie session', async () => {
    useAuthStore.setState({ session: mockSession({ grant: undefined }) });

    await expect(HomeserverService.createCustomPop(DATA)).resolves.toBeNull();
  });

  it('signs the given data with the grant session and returns the grant and proof', async () => {
    const createCustomPop = vi.fn().mockResolvedValue({ grant: 'aaa.bbb.ccc', pop: 'ddd.eee.fff' });
    useAuthStore.setState({ session: mockSession({ grant: asOpaque<GrantSession>({ createCustomPop }) }) });

    await expect(HomeserverService.createCustomPop(DATA)).resolves.toEqual({
      grant: 'aaa.bbb.ccc',
      pop: 'ddd.eee.fff',
    });
    expect(createCustomPop).toHaveBeenCalledWith(DATA);
  });

  it('raises an application error when the SDK cannot sign', async () => {
    const createCustomPop = vi.fn().mockRejectedValue(new Error('grant expired'));
    useAuthStore.setState({ session: mockSession({ grant: asOpaque<GrantSession>({ createCustomPop }) }) });

    await expect(HomeserverService.createCustomPop(DATA)).rejects.toBeInstanceOf(AppError);
  });
});
