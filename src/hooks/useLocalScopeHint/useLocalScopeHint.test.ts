import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { LOCAL_SCOPE_HINT, localScopeHintSuffix, useLocalScopeHint, withLocalScopeHint } from './useLocalScopeHint';

const ALICE = 'alice-pubky' as Pubky;

function setSources(sources: string) {
  process.env.PUBKY_RUNTIME_INDEXER_SOURCES = sources;
  resetRuntimeConfigForTests();
}

describe('useLocalScopeHint', () => {
  afterEach(() => {
    delete process.env.PUBKY_RUNTIME_INDEXER_SOURCES;
    resetRuntimeConfigForTests();
    useAuthStore.setState({ ...authInitialState });
  });

  it.each(['local', 'local,nexus'])('hints at the network for a signed-in user with the %s sources', (sources) => {
    setSources(sources);
    useAuthStore.setState({ currentUserPubky: ALICE });

    const { result } = renderHook(() => useLocalScopeHint());

    expect(result.current).toBe(LOCAL_SCOPE_HINT);
  });

  it('gives no hint with Nexus alone', () => {
    setSources('nexus');
    useAuthStore.setState({ currentUserPubky: ALICE });

    const { result } = renderHook(() => useLocalScopeHint());

    expect(result.current).toBeUndefined();
  });

  it('gives no hint to a visitor, whose rankings never come from a network', () => {
    setSources('local,nexus');

    const { result } = renderHook(() => useLocalScopeHint());

    expect(result.current).toBeUndefined();
  });
});

describe('withLocalScopeHint', () => {
  it('ends an accessible name with the hint', () => {
    expect(withLocalScopeHint('Repost (3)', LOCAL_SCOPE_HINT)).toBe('Repost (3), in your network');
  });

  it('leaves the name alone without a hint', () => {
    expect(withLocalScopeHint('Repost (3)', undefined)).toBe('Repost (3)');
    expect(localScopeHintSuffix(undefined)).toBe('');
  });
});
