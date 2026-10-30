// Preserve browser mock initialization order.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { useSocialMigrationStore } from '@/stores/socialMigration/socialMigration.store';
import { Header } from '@/organisms/Header/Header';
import { SocialMigration } from '@/templates/Auth/SocialMigration/SocialMigration';

// The forced logout never settles in these captures: the sign-out screen stays on.
const logout = vi.hoisted(() => ({ pending: new Promise<void>(() => {}) }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/migration',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: createZustandLikeHook({
    hasHydrated: true,
    currentUserPubky: 'vrt-account',
    session: null,
    sessionReference: { kind: 'grant', sessionStoreId: 'vrt', clientId: 'vrt', grantId: 'vrt' },
    restoreStatus: 'social-migration',
    isLoggingOut: false,
    generation: 'vrt',
  }),
}));
vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: createZustandLikeHook({
    secretKey: '',
    signupAttempt: null,
    hasHydrated: true,
    clearSecrets: vi.fn(),
  }),
}));
vi.mock('@/stores/socialMigration/socialMigration.store', () => ({
  useSocialMigrationStore: createZustandLikeHook({
    stage: 'running',
    reason: undefined,
    phase: 'migrating',
    pass: 'posts',
    done: 42,
    total: 120,
    counts: null,
    dropped: 0,
    needBytes: undefined,
    attempt: 1,
    resumedFrom: undefined,
    summary: undefined,
  }),
}));
vi.mock('@/libs/identity/identity', () => ({ Identity: { tryZ32FromSecret: () => 'vrt-account' } }));
vi.mock('@/controllers/auth/auth', () => ({ AuthController: { logout: () => logout.pending } }));
vi.mock('@/controllers/social-migration/social-migration', () => ({
  SocialMigrationController: { retry: vi.fn(), acknowledge: vi.fn() },
}));
vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({ isCoreExploreRoute: false, isDynamicPublicRoute: false }),
}));

type Scenario = {
  stage: string;
  reason?: string;
  heading: string;
  account?: 'held' | 'signed-out' | 'backup';
  needBytes?: number;
  summary?: { skipped: Record<string, number>; dropped: { profileImage: number; profileLinks: number } };
};

const SCENARIOS: Record<string, Scenario> = {
  'reauth-signing-out': {
    stage: 'reauth-required',
    reason: 'pre-migration-grant',
    heading: 'Your account needs an update',
  },
  'reauth-backup': {
    stage: 'reauth-required',
    reason: 'pre-migration-grant',
    account: 'backup',
    heading: 'Back up your key before continuing',
  },
  'reauth-signed-out': { stage: 'idle', account: 'signed-out', heading: 'Your account needs an update' },
  waiting: { stage: 'waiting-for-tab', heading: 'Another tab is updating your account' },
  running: { stage: 'running', heading: 'Updating your account' },
  'blocked-incomplete': {
    stage: 'blocked',
    reason: 'incomplete',
    heading: 'We could not reach your homeserver for some of your data',
  },
  'blocked-quota': {
    stage: 'blocked',
    reason: 'quota',
    needBytes: 37_500_000,
    heading: 'Your homeserver is out of space',
  },
  'blocked-unsupported': {
    stage: 'blocked',
    reason: 'homeserver-unsupported',
    heading: 'Your homeserver needs an upgrade',
  },
  'blocked-unexpected': { stage: 'blocked', reason: 'unexpected', heading: 'Something went wrong' },
  summary: {
    stage: 'summary',
    summary: { skipped: { invalid: 2 }, dropped: { profileImage: 1, profileLinks: 1 } },
    heading: 'Your account is up to date',
  },
};

for (const [name, viewport] of [
  ['desktop', VRT_VIEWPORT_DESKTOP],
  ['mobile', VRT_VIEWPORT_MOBILE],
] as const) {
  describe(`SocialMigration ${name}`, () => {
    it.each(Object.entries(SCENARIOS))('renders the %s state', async (state, scenario) => {
      const signedOut = scenario.account === 'signed-out';
      Object.assign(useAuthStore.getState(), {
        currentUserPubky: signedOut ? null : 'vrt-account',
        sessionReference: signedOut ? null : { kind: 'grant', sessionStoreId: 'vrt', clientId: 'vrt', grantId: 'vrt' },
        restoreStatus: signedOut ? 'idle' : 'social-migration',
      });
      Object.assign(useOnboardingStore.getState(), { secretKey: scenario.account === 'backup' ? 'fixture-key' : '' });
      Object.assign(useSocialMigrationStore.getState(), {
        stage: scenario.stage,
        reason: scenario.reason,
        needBytes: scenario.needBytes,
        summary: scenario.summary,
      });
      await renderForVRT(
        <>
          <Header />
          <SocialMigration />
        </>,
        { viewport },
      );
      await expect.element(page.getByRole('heading', { name: scenario.heading })).toBeVisible();
      if (scenario.stage === 'running') await expect.element(page.getByText('42 of 120')).toBeVisible();
      if (scenario.stage === 'blocked') await expect.element(page.getByRole('button', { name: 'Retry' })).toBeVisible();
      if (scenario.stage === 'summary')
        await expect.element(page.getByRole('button', { name: 'Continue' })).toBeVisible();
      if (signedOut) await expect.element(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
      await matchVrtFrameScreenshot(`social-migration-${state}-${name}`);
    });
  });
}
