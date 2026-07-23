// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { Human } from '@/templates/Onboarding/Human/Human';

// The real app mounts <Header /> from the root layout above every page; on
// /onboarding/* it renders the "Create account" step bar (1–5). Render it here
// so the snapshot matches what the user actually sees.
function HumanWithHeader() {
  return (
    <>
      <Header />
      <Human />
    </>
  );
}

// Default `state` is `Selection`, so only `HumanSelection` renders. Its dev-mode
// buttons are gated on `NODE_ENV === 'development'` (VRT runs as `test`), so the
// snapshot matches the production verification-method picker.
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
    usePathname: () => '/onboarding/human',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
  };
});

vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
  toast: vi.fn(),
}));

// Header reads auth + public-route state. Onboarding step 1 is pre-auth.
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: createZustandLikeHook({
    currentUserPubky: null as string | null,
    hasHydrated: true,
  }),
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({ isCoreExploreRoute: false, isDynamicPublicRoute: false }),
}));

vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: createZustandLikeHook({
    secretKey: null as string | null,
    inviteCode: null as string | null,
    setInviteCode: vi.fn(),
    reset: vi.fn(),
    hasHydrated: true,
  }),
}));

// `HumanBitcoinCard` fetches Lightning availability + BTC rate over the network.
// Left unmocked, the fetch result is non-deterministic (resolves to a real
// geo-block/error that differs by run, OS, and CI region), so pin both to the
// "available" happy path with fixed amounts. This snapshots the real payment
// card instead of a flaky blurred/unavailable state.
vi.mock('@/hooks/useLnVerificationInfo/useLnVerificationInfo', () => ({
  useLnVerificationInfo: () => ({ available: true as const, amountSat: 1000 }),
}));

vi.mock('@/hooks/useSatUsdRate/useSatUsdRate', () => ({
  useBtcRate: () => ({ satUsd: 0.0005, btcUsd: 50_000, lastUpdatedAt: new Date(0) }),
}));

describe('Human (onboarding) — visual regression', () => {
  it('renders the human-verification selection at desktop viewport', async () => {
    const screen = await renderForVRT(<HumanWithHeader />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('onboarding-human-desktop');
  });

  it('renders the human-verification selection at mobile viewport', async () => {
    const screen = await renderForVRT(<HumanWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('onboarding-human-mobile');
  });
});
