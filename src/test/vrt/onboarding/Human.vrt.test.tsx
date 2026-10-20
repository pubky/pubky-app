// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { Human } from '@/templates/Onboarding/Human/Human';
import { Toaster } from '@/molecules/Toaster/Toaster';
import { AuthController } from '@/controllers/auth/auth';

// The real app mounts <Header /> from the root layout above every page; on
// /onboarding/* it renders the "Create account" step bar (1–5). Render it here
// so the snapshot matches what the user actually sees.
function HumanWithHeader() {
  return (
    <>
      <Header />
      <Human />
      <Toaster />
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

vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    verifySignupToken: vi.fn().mockResolvedValue('valid'),
  },
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

// The card reads `useBtcRate().rate`. A flat rate object leaves `rate` undefined,
// so the price line stays on its skeleton and the screenshot records that instead
// of ₿ 1,000.
vi.mock('@/hooks/useSatUsdRate/useSatUsdRate', () => ({
  useBtcRate: () => ({
    rate: { satUsd: 0.0005, btcUsd: 50_000, lastUpdatedAt: new Date(0) },
    status: 'ready' as const,
  }),
}));

async function waitForVerificationCards(screen: Awaited<ReturnType<typeof renderForVRT>>) {
  await expect.element(screen.getByTestId('sms-verification-card')).toBeVisible();
  await expect.element(screen.getByTestId('human-sms-card-receive-sms-btn')).toBeVisible();
  await expect.element(screen.getByTestId('bitcoin-payment-card')).toBeVisible();
  // The card paints before the price. Both the phone badge and the desktop
  // headline say "₿ 1,000"; a remaining skeleton means the rate has not landed.
  await expect
    .poll(() => {
      const card = document.querySelector('[data-testid="bitcoin-payment-card"]');
      return Boolean(card?.textContent?.includes('₿ 1,000') && card.querySelector('[data-slot="skeleton"]') === null);
    })
    .toBe(true);
}

describe('Human (onboarding) — visual regression', () => {
  beforeEach(() => {
    vi.mocked(AuthController.verifySignupToken).mockReset().mockResolvedValue('valid');
  });

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

  it('keeps the invite option and verified navigation reachable on mobile', async () => {
    await preloadImages(['/images/sms-verification-phone.webp', '/images/bitcoin-payment.webp', '/images/gift.webp']);
    const screen = await renderForVRT(<HumanWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await waitForVerificationCards(screen);

    const inviteButton = screen.getByRole('button', { name: 'Enter invite code' });
    const inviteBounds = inviteButton.element().getBoundingClientRect();
    expect(inviteBounds.top).toBeGreaterThanOrEqual(0);
    expect(inviteBounds.bottom).toBeLessThanOrEqual(VRT_VIEWPORT_MOBILE.height);
    expect(inviteBounds.left).toBeGreaterThanOrEqual(0);
    expect(inviteBounds.right).toBeLessThanOrEqual(VRT_VIEWPORT_MOBILE.width);
    await expect.element(inviteButton).toBeVisible();
    await matchVrtFrameScreenshot('onboarding-human-invite-option-mobile');

    await inviteButton.click();
    await screen.getByRole('textbox', { name: 'Invite code' }).fill('YVB2-YFRN-GDY0');
    await expect.element(screen.getByRole('status')).toHaveTextContent('Invite code applied');

    const continueButton = screen.getByRole('button', { name: 'Continue' });
    continueButton.element().scrollIntoView({ block: 'end' });
    await expect.element(continueButton).toBeEnabled();
    expect(document.querySelector('[data-cy="toast"]')).toBeNull();

    const statusBounds = screen.getByRole('status').element().getBoundingClientRect();
    for (const name of ['Back', 'Continue']) {
      const button = screen.getByRole('button', { name }).element();
      const bounds = button.getBoundingClientRect();
      expect(bounds.top).toBeGreaterThanOrEqual(statusBounds.bottom);
      expect(bounds.bottom).toBeLessThanOrEqual(VRT_VIEWPORT_MOBILE.height);
      expect(
        button.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)),
      ).toBe(true);
    }
    await matchVrtFrameScreenshot('onboarding-human-invite-verified-mobile');

    await screen.getByRole('button', { name: 'Back' }).click();
    await expect.element(screen.getByTestId('human-verification-cards')).toBeVisible();
  });

  it('clears an invalid-code toast immediately when the corrected code verifies on mobile', async () => {
    vi.mocked(AuthController.verifySignupToken).mockResolvedValueOnce('invalid').mockResolvedValueOnce('valid');
    await preloadImages(['/images/sms-verification-phone.webp', '/images/bitcoin-payment.webp', '/images/gift.webp']);
    const screen = await renderForVRT(<HumanWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await screen.getByRole('button', { name: 'Enter invite code' }).click();
    const input = screen.getByRole('textbox', { name: 'Invite code' });
    await input.fill('AAAA-BBBB-CCCC');
    await expect
      .poll(() => document.querySelector('[data-cy="toast"][data-state="open"]')?.textContent)
      .toContain('Invalid invite code');

    await input.fill('YVB2-YFRN-GDY0');
    // This must finish before the three-second toast expiry could hide the regression.
    await expect
      .poll(() => document.querySelector('[data-cy="toast"][data-state="open"]'), { timeout: 500 })
      .toBeNull();
    await expect.element(screen.getByText('Invite code applied')).toBeVisible();
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    continueButton.element().scrollIntoView({ block: 'end' });
    await expect.element(continueButton).toBeEnabled();
    await continueButton.click();
  });
});
