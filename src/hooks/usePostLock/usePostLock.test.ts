import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLockFile } from '@/hooks/useLockFile/useLockFile';
import { type LockFile, VerifierType } from '@/services/locks/locks.types';
import { usePostLock } from './usePostLock';

vi.mock('@/hooks/useLockFile/useLockFile', () => ({ useLockFile: vi.fn() }));

const LOCK_URL = 'pubky://hs/lock.json';

/** Minimal lock file whose single criterion uses the given verifier type. */
const buildLockFile = (verifierType: VerifierType): LockFile => ({
  version: 1,
  creator: 'creator',
  guarded_resource: { path: '/x', hash: 'h', content_type: 'text/plain', size: 1 },
  criteria: [{ criterion_id: 'c1', verifier_type: verifierType, params: {} }],
  lock_logic: { type: 'all', criteria: ['c1'] },
  access_policy: { requested_credential_ttl_seconds: 900 },
  lock_server: { override: '' },
});

describe('usePostLock', () => {
  it('parses content, fetches the lock file by the top-level lock URL, and resolves the verifier type', () => {
    vi.mocked(useLockFile).mockReturnValue({ lockFile: buildLockFile(VerifierType.PASSWORD), hasError: false });
    const content = JSON.stringify({ lock_title: 't', teaser_description: 'd' });

    const { result } = renderHook(() => usePostLock({ content, lock: LOCK_URL }));

    expect(result.current.lockContent?.lock_title).toBe('t');
    expect(useLockFile).toHaveBeenCalledWith(LOCK_URL);
    expect(result.current.verifierType).toBe(VerifierType.PASSWORD);
    expect(result.current.hasError).toBe(false);
  });

  it('returns null lockContent for non-lock content', () => {
    vi.mocked(useLockFile).mockReturnValue({ lockFile: null, hasError: false });

    const { result } = renderHook(() => usePostLock({ content: 'not json', lock: null }));

    expect(result.current.lockContent).toBeNull();
    expect(useLockFile).toHaveBeenCalledWith(null);
  });

  it('propagates the lock-file error', () => {
    vi.mocked(useLockFile).mockReturnValue({ lockFile: null, hasError: true });
    const content = JSON.stringify({ lock_title: 't', teaser_description: 'd' });

    const { result } = renderHook(() => usePostLock({ content, lock: LOCK_URL }));

    expect(result.current.hasError).toBe(true);
    expect(result.current.verifierType).toBeNull();
  });
});
