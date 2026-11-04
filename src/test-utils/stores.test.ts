import { describe, expect, it, vi } from 'vitest';
import { mockRingSession } from '@/test-utils/pubky';
import { createZustandLikeHook } from './stores';

describe('createZustandLikeHook', () => {
  it('reads a missing auth session as null', () => {
    const snapshot: { currentUserPubky: string; restoreStatus: string; session?: null } = {
      currentUserPubky: 'viewer',
      restoreStatus: 'ready',
    };
    const useAuthStore = createZustandLikeHook(snapshot);

    expect(useAuthStore((state) => state.session)).toBeNull();
    expect(useAuthStore.getState()).toBe(snapshot);
    snapshot.restoreStatus = 'idle';
    expect(useAuthStore.getState().restoreStatus).toBe('idle');
  });

  it('keeps an auth session the snapshot already sets', () => {
    const session = mockRingSession(['/:rw'], 'viewer');
    const signedIn = createZustandLikeHook({ currentUserPubky: 'viewer', session });
    const signedOut = createZustandLikeHook({ currentUserPubky: null, session: null });

    expect(signedIn.getState().session).toBe(session);
    expect(signedOut.getState().session).toBeNull();
  });

  it('leaves a non-auth snapshot without a session field', () => {
    const useHomeStore = createZustandLikeHook({ reach: 'all', setReach: vi.fn() });

    expect(Object.hasOwn(useHomeStore.getState(), 'session')).toBe(false);
    expect(useHomeStore((state) => state.reach)).toBe('all');
  });
});
