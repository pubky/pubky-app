// Intentional import order — keep alias imports grouped with the template last;
// matches the other VRT suites. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { BackupPage } from '@/templates/Onboarding/BackupPage/BackupPage';

// The real app mounts <Header /> from the root layout above every page; on
// /onboarding/* it renders the "Create account" step bar (1–5). Render it here
// so the snapshot matches what the user actually sees.
function BackupWithHeader() {
  return (
    <>
      <Header />
      <BackupPage />
    </>
  );
}

// BackupPage only reads the router (for navigation buttons) and intl — no store
// or data hooks — so the default render is fully static.
vi.mock('next/navigation', () => {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  };
  return {
    useRouter: () => router,
    usePathname: () => '/onboarding/backup',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
  };
});

// Header reads auth + public-route state. Backup (step 4) is pre-auth.
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: createZustandLikeHook({
    currentUserPubky: null as string | null,
    hasHydrated: true,
  }),
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({ isCoreExploreRoute: false, isDynamicPublicRoute: false }),
}));

describe('BackupPage (onboarding) — visual regression', () => {
  it('renders the backup page at desktop viewport', async () => {
    const screen = await renderForVRT(<BackupWithHeader />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('onboarding-backup-desktop');
  });

  it('renders the backup page at mobile viewport', async () => {
    const screen = await renderForVRT(<BackupWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('onboarding-backup-mobile');
  });
});
