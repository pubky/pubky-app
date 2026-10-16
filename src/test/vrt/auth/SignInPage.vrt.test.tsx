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
import { useSignInStore } from '@/stores/signIn/signIn.store';
import { signInInitialState } from '@/stores/signIn/signIn.types';
import { SignInPage } from '@/templates/Auth/SignInPage/SignInPage';

// Header logo, both method illustrations, the Ring-only layout artwork, the mark
// centred on the QR and the blurred expired QR. Preload so a cold fetch cannot
// race the first paint (see the landing and scan VRT).
const SIGN_IN_IMAGE_URLS = [
  '/pubky-logo.svg',
  '/images/keyring.webp',
  '/images/passport-cloud.webp',
  '/images/scan.webp',
  '/images/logo-pubky-ring.svg',
  '/images/ring-logo.svg',
  '/images/qr-blurred.png',
];

type RingRequest = 'ready' | 'generating' | 'expired';

// Per-test scenario read by the mocks below at call time.
const scenario = vi.hoisted(() => ({
  ring: 'ready' as RingRequest,
  passport: 'enabled' as 'enabled' | 'disabled',
}));

// The root layout mounts <Header /> above every page. On /sign-in it is the
// guest header: logo, "Sign in" title from md up, social links and "New here?".
function SignInWithHeader() {
  return (
    <>
      <Header />
      <SignInPage />
    </>
  );
}

vi.mock('next/navigation', () => {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  };
  const searchParams = new URLSearchParams();
  return {
    useRouter: () => router,
    usePathname: () => '/sign-in',
    useSearchParams: () => searchParams,
    useParams: () => ({}),
  };
});

// Stub the auth flows at the controller boundary so the real `useAuthUrl`,
// `useMobileAuth` and `usePassportAuth` drive every state. The Ring request
// always resolves to the same URL, so QRCodeSVG draws one matrix on every run
// and OS. Starting Passport supersedes the pending Ring request (one active
// auth flow), which expires the QR the way the app does, and its approval
// never settles, so the page stays on "Waiting for Passport...".
vi.mock('@/controllers/auth/auth', async () => {
  const { createCanceledError } = await import('@/libs/error/auth-flow-canceled');
  const pending = <T,>() => new Promise<T>(() => {});
  let supersedeRing = () => {};
  return {
    AuthController: {
      getAuthUrl: () => {
        if (scenario.ring === 'generating') return pending();
        const ringApproval = new Promise<never>((_, reject) => {
          supersedeRing = () => reject(createCanceledError());
        });
        if (scenario.ring === 'expired') supersedeRing();
        return Promise.resolve({
          authorizationUrl: 'pubkyauth://signin?relay=https%3A%2F%2Frelay.pubky.app&secret=vrt-fixed-sign-in-token',
          awaitApproval: ringApproval,
          cancelAuthFlow: () => {},
        });
      },
      getPassportAuthUrl: async () => {
        supersedeRing();
        return {
          authorizationUrl: 'pubkyauth://signin?relay=https%3A%2F%2Frelay.pubky.app&secret=vrt-fixed-passport-token',
          awaitApproval: pending(),
          cancelAuthFlow: () => {},
        };
      },
      initializeAuthenticatedSession: async () => {},
      loginWithMnemonic: async () => false,
      loginWithEncryptedFile: async () => false,
    },
  };
});

// The shared setup pins Passport eligibility to 'enabled'; this file also
// captures the Ring-only layout, so pin it per scenario.
vi.mock('@/hooks/usePassportEligibility/usePassportEligibility', () => ({
  usePassportEligibility: () => scenario.passport,
}));

// The shared setup stubs the Passport attempt as idle. Restore the real hook so
// a Continue with Google click runs the real attempt against the stubbed
// `AuthController` and the setup's inert popup.
vi.mock('@/hooks/usePassportAuth/usePassportAuth', (importOriginal) => importOriginal());

vi.mock('@/molecules/Toaster/toast');

// Sign-in is reached signed out: guest header.
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: createZustandLikeHook({
    currentUserPubky: null as string | null,
    session: null,
    sessionReference: null,
    restoreStatus: 'idle',
    hasHydrated: true,
    setShowSignInDialog: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({
    isCoreExploreRoute: false,
    isDynamicPublicRoute: false,
    isPublicExploreRoute: false,
    isPublicRoute: false,
  }),
}));

const VIEWPORTS = [
  ['desktop', VRT_VIEWPORT_DESKTOP],
  ['mobile', VRT_VIEWPORT_MOBILE],
] as const;

async function renderSignIn(viewport: (typeof VIEWPORTS)[number][1]) {
  await preloadImages(SIGN_IN_IMAGE_URLS);
  return renderForVRT(<SignInWithHeader />, { viewport });
}

beforeEach(() => {
  scenario.ring = 'ready';
  scenario.passport = 'enabled';
  useSignInStore.setState(signInInitialState);
});

for (const [name, viewport] of VIEWPORTS) {
  const isDesktop = name === 'desktop';
  const ringAction = isDesktop ? 'Copy authentication link' : 'Authorize with Pubky Ring';

  describe(`Sign-in page ${name} — visual regression`, () => {
    it('renders both sign-in methods', async () => {
      await renderSignIn(viewport);
      await expect.element(page.getByRole('button', { name: ringAction })).toBeEnabled();
      if (!isDesktop) {
        await expect.element(page.getByRole('button', { name: 'Authorize with Bitkit' })).toBeEnabled();
      }
      await expect.element(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
      await matchVrtFrameScreenshot(`sign-in-page-${name}`);
    });

    it('renders Pubky Ring only when Passport is unavailable', async () => {
      scenario.passport = 'disabled';
      await renderSignIn(viewport);
      await expect.element(page.getByRole('button', { name: ringAction })).toBeEnabled();
      if (!isDesktop) {
        await expect.element(page.getByRole('button', { name: 'Authorize with Bitkit' })).toBeEnabled();
      }
      await expect.element(page.getByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
      await matchVrtFrameScreenshot(`sign-in-page-ring-only-${name}`);
    });

    it('renders the Pubky Ring request while it is generated', async () => {
      scenario.ring = 'generating';
      await renderSignIn(viewport);
      if (isDesktop) {
        await expect.element(page.getByText('Generating QR Code...')).toBeVisible();
      } else {
        const signerButtons = page.getByRole('button', { name: 'Generating...' });
        await expect.element(signerButtons.nth(0)).toBeDisabled();
        await expect.element(signerButtons.nth(1)).toBeDisabled();
      }
      await matchVrtFrameScreenshot(`sign-in-page-ring-generating-${name}`);
    });

    it('renders an expired Pubky Ring request', async () => {
      scenario.ring = 'expired';
      await renderSignIn(viewport);
      if (isDesktop) {
        await expect.element(page.getByRole('button', { name: 'Reload sign-in QR code' })).toBeEnabled();
      } else {
        const reloadButtons = page.getByRole('button', { name: 'Click to reload' });
        await expect.element(reloadButtons.nth(0)).toBeEnabled();
        await expect.element(reloadButtons.nth(1)).toBeEnabled();
      }
      await matchVrtFrameScreenshot(`sign-in-page-ring-expired-${name}`);
    });

    it('renders the Continue with Google help', async () => {
      await renderSignIn(viewport);
      await page.getByRole('button', { name: 'About signing in with Google' }).click();
      await expect.element(page.getByText('Continue with Google, powered by Pubky Passport.')).toBeVisible();
      await matchVrtFrameScreenshot(`sign-in-page-google-help-${name}`);
    });

    it('renders the page while Passport is open', async () => {
      await renderSignIn(viewport);
      await page.getByRole('button', { name: 'Continue with Google' }).click();
      await expect.element(page.getByRole('button', { name: 'Waiting for Passport...' })).toBeDisabled();
      if (isDesktop) {
        await expect.element(page.getByRole('button', { name: 'Reload sign-in QR code' })).toBeDisabled();
      } else {
        const reloadButtons = page.getByRole('button', { name: 'Click to reload' });
        await expect.element(reloadButtons.nth(0)).toBeDisabled();
        await expect.element(reloadButtons.nth(1)).toBeDisabled();
      }
      await matchVrtFrameScreenshot(`sign-in-page-google-pending-${name}`);
    });

    it('renders the signing-in checklist', async () => {
      // One frame shows every step treatment: completed, running and pending.
      useSignInStore.setState({ ...signInInitialState, authUrlResolved: true, profileChecked: true });
      await renderSignIn(viewport);
      await expect.element(page.getByText('Signing in.')).toBeVisible();
      await expect.element(page.getByText('Syncing settings')).toBeVisible();
      await matchVrtFrameScreenshot(`sign-in-page-progress-${name}`);
    });
  });
}
