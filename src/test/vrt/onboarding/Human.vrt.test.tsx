// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { Human } from '@/templates/Onboarding/Human/Human';
import { Toaster } from '@/molecules/Toaster/Toaster';
import { AuthController } from '@/controllers/auth/auth';
import { useLnVerificationInfo } from '@/hooks/useLnVerificationInfo/useLnVerificationInfo';
import { useSmsVerificationInfo } from '@/hooks/useSmsVerificationInfo/useSmsVerificationInfo';
import { usePassportEligibility } from '@/hooks/usePassportEligibility/usePassportEligibility';
import { useBtcRate } from '@/hooks/useSatUsdRate/useSatUsdRate';

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
  useSmsVerificationInfo: vi.fn(),
}));

vi.mock('@/hooks/useLnVerificationInfo/useLnVerificationInfo', () => ({
  useLnVerificationInfo: vi.fn(),
}));

vi.mock('@/hooks/usePassportEligibility/usePassportEligibility', () => ({
  usePassportEligibility: vi.fn(),
}));

// The card reads `useBtcRate().rate`. A flat rate object leaves `rate` undefined,
// so the price line stays on its skeleton and the screenshot records that instead
// of ₿ 1,000.
vi.mock('@/hooks/useSatUsdRate/useSatUsdRate', () => ({
  useBtcRate: vi.fn(),
}));

async function waitForVerificationCards(screen: Awaited<ReturnType<typeof renderForVRT>>) {
  await expect.element(screen.getByTestId('human-sms-card-receive-sms-btn')).toBeVisible();
  // Wait for the live price and conversion to settle before capturing.
  await expect
    .poll(() => {
      const card = document.querySelector('[data-testid="bitcoin-payment-card"]');
      return Boolean(card?.textContent?.includes('₿1,000') && card.querySelector('[data-slot="skeleton"]') === null);
    })
    .toBe(true);
}

describe('Human (onboarding) — visual regression', () => {
  beforeEach(() => {
    vi.mocked(usePassportEligibility).mockReturnValue('enabled');
    vi.mocked(useBtcRate).mockReturnValue({
      rate: { satUsd: 0.0005, btcUsd: 50_000, lastUpdatedAt: new Date(0) },
      status: 'ready',
    });
    vi.mocked(AuthController.verifySignupToken).mockReset().mockResolvedValue('valid');
    vi.mocked(useLnVerificationInfo).mockReturnValue({ available: true, amountSat: 1000 });
    vi.mocked(useSmsVerificationInfo).mockReturnValue({ available: true });
  });

  it('renders the human-verification selection at desktop viewport', async () => {
    await preloadImages(['/images/sms-verification-phone.webp', '/images/bitcoin-payment.webp', '/images/gift.webp']);
    const screen = await renderForVRT(<HumanWithHeader />, { viewport: VRT_VIEWPORT_DESKTOP });
    await waitForVerificationCards(screen);
    await matchVrtFrameScreenshot('onboarding-human-desktop');
  });

  it('renders the human-verification selection at mobile viewport', async () => {
    await preloadImages(['/images/sms-verification-phone.webp', '/images/bitcoin-payment.webp', '/images/gift.webp']);
    const screen = await renderForVRT(<HumanWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await waitForVerificationCards(screen);
    await matchVrtFrameScreenshot('onboarding-human-mobile');
  });

  it('keeps the mobile agreement visible and stable when Passport eligibility resolves', async () => {
    vi.mocked(usePassportEligibility).mockReturnValue('pending');
    const screen = await renderForVRT(<HumanWithHeader />, { viewport: { width: 375, height: 812 } });
    const footer = screen.getByTestId('human-selection-footer');
    await expect.element(footer).toBeVisible();
    const initialBounds = footer.element().getBoundingClientRect();

    vi.mocked(usePassportEligibility).mockReturnValue('enabled');
    await screen.rerender(<HumanWithHeader />);

    await expect.element(footer).toBeVisible();
    const settledBounds = footer.element().getBoundingClientRect();
    expect(settledBounds.top).toBeCloseTo(initialBounds.top, 0);
    expect(settledBounds.height).toBeCloseTo(initialBounds.height, 0);
  });

  it.each([
    ['desktop', VRT_VIEWPORT_DESKTOP],
    ['mobile', VRT_VIEWPORT_MOBILE],
  ] as const)('renders the geo-blocked payment option on %s', async (name, viewport) => {
    vi.mocked(useLnVerificationInfo).mockReturnValue({ available: false });
    const screen = await renderForVRT(<HumanWithHeader />, { viewport });
    if (name === 'desktop') {
      await expect.element(screen.getByRole('status')).toHaveTextContent('Not available in your country');
    } else {
      await expect.element(screen.getByRole('button', { name: 'Why Bitcoin payment is unavailable' })).toBeVisible();
    }
    await expect.element(screen.getByRole('button', { name: 'Bitcoin payment' })).toBeDisabled();
    await expect.element(screen.getByRole('button', { name: 'Phone number' })).toBeEnabled();
    await expect.element(screen.getByRole('button', { name: 'Invite code' })).toBeEnabled();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(viewport.width);
    await matchVrtFrameScreenshot(`onboarding-human-geoblocked-${name}`);
  });

  it('explains the blocked payment on tap at the Figma mobile width', async () => {
    vi.mocked(useLnVerificationInfo).mockReturnValue({ available: false });
    const screen = await renderForVRT(<HumanWithHeader />, { viewport: { width: 375, height: 812 } });
    await screen.getByRole('button', { name: 'Why Bitcoin payment is unavailable' }).click();
    await expect.element(page.getByRole('dialog', { name: 'Not available in your country' })).toBeVisible();
    await expect.element(page.getByText('Try a different verification method')).toBeVisible();
    const bounds = page.getByRole('dialog').element().getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(375);
    await matchVrtFrameScreenshot('onboarding-human-geoblock-explanation-mobile');
  });

  it('fits all verification methods and Back at the Figma mobile size', async () => {
    const screen = await renderForVRT(<HumanWithHeader />, { viewport: { width: 375, height: 812 } });
    await waitForVerificationCards(screen);
    for (const name of ['Bitcoin payment ($0.50)', 'Phone number', 'Invite code', 'Back']) {
      const bounds = screen.getByRole('button', { name, exact: true }).element().getBoundingClientRect();
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(812);
      expect(bounds.left).toBeGreaterThanOrEqual(16);
      expect(bounds.right).toBeLessThanOrEqual(359);
    }
    await matchVrtFrameScreenshot('onboarding-human-figma-mobile');
  });

  it('keeps the three cards aligned at the Figma desktop width', async () => {
    const screen = await renderForVRT(<HumanWithHeader />, { viewport: { width: 1280, height: 1024 } });
    await waitForVerificationCards(screen);
    const cards = ['bitcoin-payment-card', 'sms-verification-card', 'invite-code-option-card'].map((id) =>
      screen.getByTestId(id).element().getBoundingClientRect(),
    );
    for (const card of cards) {
      expect(card.top).toBeCloseTo(cards[0].top, 0);
      expect(card.width).toBeCloseTo(384, 0);
      expect(card.height).toBeCloseTo(cards[0].height, 0);
    }
    expect(cards[0].right).toBeLessThan(cards[1].left);
    expect(cards[1].right).toBeLessThan(cards[2].left);
    const back = screen.getByRole('button', { name: 'Back', exact: true });
    await expect.element(back).toBeVisible();
    const backBounds = back.element().getBoundingClientRect();
    expect(backBounds.left).toBeCloseTo(cards[0].left, 0);
    const footer = screen.getByTestId('human-selection-footer').element().getBoundingClientRect();
    expect(footer.top).toBeGreaterThanOrEqual(cards[0].bottom);
    expect(backBounds.top - footer.bottom).toBeCloseTo(24, 0);
    expect(backBounds.height).toBeCloseTo(60, 0);
    expect(backBounds.width).toBeLessThan(130);
    await expect.element(screen.getByRole('link', { name: 'Terms of Service' })).toBeVisible();
    await matchVrtFrameScreenshot('onboarding-human-figma-desktop');
  });

  for (const [name, viewport] of [
    ['desktop', VRT_VIEWPORT_DESKTOP],
    ['mobile', { width: 375, height: 812 }],
  ] as const) {
    it.each(['enabled', 'disabled', 'pending'] as const)(
      `shows the agreement at ${name} width when Passport is %s`,
      async (eligibility) => {
        vi.mocked(usePassportEligibility).mockReturnValue(eligibility);
        const screen = await renderForVRT(<HumanWithHeader />, { viewport });
        const footer = screen.getByTestId('human-selection-footer');
        await expect.element(footer).toBeVisible();
        await expect.element(screen.getByRole('link', { name: 'Terms of Service' })).toBeVisible();
        await expect.element(screen.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
        await expect.element(screen.getByRole('button', { name: 'over 18 years old.' })).toBeVisible();
        await matchVrtFrameScreenshot(`onboarding-human-agreement-${eligibility}-${name}`);
        const back = screen.getByRole('button', { name: 'Back', exact: true });
        footer.element().scrollIntoView({ block: 'center' });
        const bounds = back.element().getBoundingClientRect();
        expect(bounds.top).toBeGreaterThanOrEqual(0);
        expect(bounds.bottom).toBeLessThanOrEqual(viewport.height);
        expect(footer.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(bounds.top);
        if (name === 'mobile' && eligibility === 'enabled') {
          await matchVrtFrameScreenshot('onboarding-human-agreement-footer-mobile');
        }
      },
    );

    it(`keeps Bitcoin verification available after a rate failure on ${name}`, async () => {
      vi.mocked(useBtcRate).mockReturnValue({ rate: null, status: 'failed' });
      const screen = await renderForVRT(<HumanWithHeader />, { viewport });
      await expect.element(screen.getByRole('button', { name: 'Bitcoin payment', exact: true })).toBeEnabled();
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(viewport.width);
      await matchVrtFrameScreenshot(`onboarding-human-rate-failed-${name}`);
    });
  }

  it('keeps the invite option and verified navigation reachable on mobile', async () => {
    await preloadImages(['/images/sms-verification-phone.webp', '/images/bitcoin-payment.webp', '/images/gift.webp']);
    const screen = await renderForVRT(<HumanWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await waitForVerificationCards(screen);

    const inviteButton = screen.getByRole('button', { name: 'Invite code' });
    inviteButton.element().scrollIntoView({ block: 'center' });
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
    await expect.element(screen.getByRole('button', { name: 'Invite code' })).toBeVisible();
  });

  it('clears an invalid-code toast immediately when the corrected code verifies on mobile', async () => {
    vi.mocked(AuthController.verifySignupToken).mockResolvedValueOnce('invalid').mockResolvedValueOnce('valid');
    await preloadImages(['/images/sms-verification-phone.webp', '/images/bitcoin-payment.webp', '/images/gift.webp']);
    const screen = await renderForVRT(<HumanWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await screen.getByRole('button', { name: 'Invite code' }).click();
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
