import * as React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthStore } from '@/stores/auth/auth.types';
import { ProfileProvider, useProfileContext } from './ProfileProvider';

const authState = { currentUserPubky: 'signed-in-user' } as AuthStore;

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn((selector?: (s: AuthStore) => unknown) => {
    if (selector) {
      return selector(authState);
    }
    return authState;
  }),
}));

describe('ProfileProvider', () => {
  it('treats empty-string pubky prop as another user (not own profile)', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProfileProvider pubky="">{children}</ProfileProvider>
    );
    const { result } = renderHook(() => useProfileContext(), { wrapper });

    expect(result.current.isOwnProfile).toBe(false);
    expect(result.current.pubky).toBe('');
  });
});
