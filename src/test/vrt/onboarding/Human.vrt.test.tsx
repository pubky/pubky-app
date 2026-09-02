// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
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

vi.mock('@/molecules/Toaster/toast');

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

// `HumanSmsCard` / `HumanBitcoinCard` fetch Homegate availability over the
// network. Left unmocked, the first paint is a skeleton (`null`) and the
// settled result is non-deterministic (geo-block/error differs by run, OS,
// and CI region). Pin both to the "available" happy path so the snapshot is
// the real cards, not a flaky skeleton or blurred/unavailable state.
vi.mock('@/hooks/useSmsVerificationInfo/useSmsVerificationInfo', () => ({
  useSmsVerificationInfo: () => ({ available: true as const }),
}));

vi.mock('@/hooks/useLnVerificationInfo/useLnVerificationInfo', () => ({
  useLnVerificationInfo: () => ({ available: true as const, amountSat: 1000 }),
}));

vi.mock('@/hooks/useSatUsdRate/useSatUsdRate', () => ({
  useBtcRate: () => ({ satUsd: 0.0005, btcUsd: 50_000, lastUpdatedAt: new Date(0) }),
}));

async function waitForVerificationCards(screen: Awaited<ReturnType<typeof renderForVRT>>) {
  await expect.element(screen.getByTestId('sms-verification-card')).toBeVisible();
  await expect.element(screen.getByTestId('human-sms-card-receive-sms-btn')).toBeVisible();
  await expect.element(screen.getByTestId('bitcoin-payment-card')).toBeVisible();
}

describe('Human (onboarding) — visual regression', () => {
  it('renders the human-verification selection at desktop viewport', async () => {
    await preloadImages(['/images/sms-verification-phone.webp', '/images/bitcoin-payment.webp']);
    const screen = await renderForVRT(<HumanWithHeader />, { viewport: VRT_VIEWPORT_DESKTOP });
    await waitForVerificationCards(screen);
    await matchVrtFrameScreenshot('onboarding-human-desktop');
  });

  it('renders the human-verification selection at mobile viewport', async () => {
    await preloadImages(['/images/sms-verification-phone.webp', '/images/bitcoin-payment.webp']);
    const screen = await renderForVRT(<HumanWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await waitForVerificationCards(screen);
    await matchVrtFrameScreenshot('onboarding-human-mobile');
  });
});
