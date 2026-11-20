import { beforeEach, describe, expect, it } from 'vitest';
import type { PersistedAuth } from '@/libs/auth/session.types';
import { SHOP_CLEANUP_ACK_KEY, SHOP_TEARDOWN_PENDING_KEY } from '@/libs/shop-embed/cleanup';
import { authInitialState } from '@/stores/auth/auth.types';
import {
  AUTH_PERSIST_KEY,
  AUTH_STORE_VERSION,
  LEGACY_AUTH_PERSIST_KEY,
  PREVIOUS_AUTH_PERSIST_KEY,
} from '@/stores/persistedKeys';
import { mockGrantReference } from '@/test-utils/pubky';
import { getLandingAuthMode } from './landing-auth-mode';

const guest = { ...authInitialState, hasHydrated: true };
const record: PersistedAuth = {
  generation: 'signed-out',
  currentUserPubky: null,
  sessionReference: null,
  hasProfile: null,
  retiringSession: null,
};

function persist(changes: Partial<PersistedAuth> = {}) {
  localStorage.setItem(
    AUTH_PERSIST_KEY,
    JSON.stringify({ version: AUTH_STORE_VERSION, state: { ...record, ...changes } }),
  );
}

describe('getLandingAuthMode', () => {
  beforeEach(() => localStorage.clear());

  it('distinguishes a first visit from a stale generation whose record was removed', () => {
    expect(getLandingAuthMode(localStorage, guest)).toBe('public');
    expect(getLandingAuthMode(localStorage, { ...guest, generation: 'old' })).toBe('guarded');
  });

  it.each([{ currentUserPubky: 'alice' }, { sessionReference: mockGrantReference() }])(
    'hands a stored account to the session guard before hydration',
    (account) => {
      persist(account);
      expect(getLandingAuthMode(localStorage, authInitialState)).toBe('guarded');
    },
  );

  it('aligns differing clean guest generations only after hydration and while locally signed out', () => {
    persist();
    expect(getLandingAuthMode(localStorage, authInitialState)).toBe('public');
    expect(getLandingAuthMode(localStorage, guest)).toBe('rehydrate-guest');
    expect(getLandingAuthMode(localStorage, { ...guest, restoreStatus: 'restoring' })).toBe('public');
    expect(getLandingAuthMode(localStorage, { ...guest, generation: record.generation })).toBe('public');
    expect(JSON.parse(localStorage.getItem(AUTH_PERSIST_KEY)!).state.generation).toBe(record.generation);
  });

  it.each([{ retiringSession: mockGrantReference() }, { pendingRetirements: [mockGrantReference()] }])(
    'reconciles the generation before retiring an outgoing session',
    (retirement) => {
      persist(retirement);
      expect(getLandingAuthMode(localStorage, authInitialState)).toBe('public');
      expect(getLandingAuthMode(localStorage, guest)).toBe('guarded');
      expect(getLandingAuthMode(localStorage, { ...guest, generation: record.generation })).toBe('cleanup');
    },
  );

  it('only requests Shop cleanup while acknowledgement or local teardown is outstanding', () => {
    const current = { ...guest, generation: record.generation };
    persist({ shopCleanupEpoch: 'logout' });
    expect(getLandingAuthMode(localStorage, current)).toBe('cleanup');
    localStorage.setItem(SHOP_CLEANUP_ACK_KEY, 'logout');
    expect(getLandingAuthMode(localStorage, current)).toBe('public');
    localStorage.setItem(SHOP_TEARDOWN_PENDING_KEY, '1');
    expect(getLandingAuthMode(localStorage, current)).toBe('cleanup');
  });

  it.each([
    [LEGACY_AUTH_PERSIST_KEY, { sessionExport: 'old-cookie' }],
    [PREVIOUS_AUTH_PERSIST_KEY, { retiringSession: { kind: 'cookie', sessionExport: 'old-cookie' } }],
  ] as const)('preserves unretired cookie metadata in %s alongside a current guest record', (key, state) => {
    persist();
    localStorage.setItem(key, JSON.stringify({ state: { currentUserPubky: null, ...state } }));
    expect(getLandingAuthMode(localStorage, { ...guest, generation: record.generation })).toBe('cleanup');
  });
});
