// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE, type VrtViewport } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { BREAKPOINTS } from '@/config/theme';
import { Header } from '@/organisms/Header/Header';
import { SignInPage } from '@/templates/Auth/SignInPage/SignInPage';

// Header logo, the two method illustrations, and the mark centred on the QR.
// Preload so a cold fetch cannot race the first paint (see landing / scan VRT).
const SIGN_IN_IMAGE_URLS = [
  '/pubky-logo.svg',
  '/images/keyring.webp',
  '/images/passport-cloud.webp',
  '/images/ring-logo.svg',
] as const;

// Mutable so one file can capture the resting page and the in-progress checklist.
// The real sign-in store is process-wide; leaving it live would leak between tests.
const signInState = vi.hoisted(() => {
  const state = {
    authUrlResolved: false,
    profileChecked: false,
    bootstrapFetched: false,
    dataPersisted: false,
    homeserverSynced: false,
    setAuthUrlResolved: (value: boolean) => {
      state.authUrlResolved = value;
    },
    setProfileChecked: (value: boolean) => {
      state.profileChecked = value;
    },
    setBootstrapFetched: (value: boolean) => {
      state.bootstrapFetched = value;
    },
    setDataPersisted: (value: boolean) => {
      state.dataPersisted = value;
    },
    setHomeserverSynced: (value: boolean) => {
      state.homeserverSynced = value;
    },
    reset: () => {
      state.authUrlResolved = false;
      state.profileChecked = false;
      state.bootstrapFetched = false;
      state.dataPersisted = false;
      state.homeserverSynced = false;
    },
  };
  return state;
});

// Root layout mounts <Header /> above every page. On /sign-in it is the guest
// header: logo, "Sign in" title from md up, social links, and "New here?".
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

// `useMobileAuth` issues the auth URL the QR encodes. Left real, it hits the
// network and the matrix changes every run. Pin a constant ready URL so
// QRCodeSVG is identical on every run and OS (same approach as the scan VRT).
vi.mock('@/hooks/useMobileAuth/useMobileAuth', () => ({
  useMobileAuth: () => ({
    url: 'https://pubky.app/vrt-auth-fixed-signin-token',
    isLoading: false,
    isExpired: false,
    fetchUrl: vi.fn(),
    copyAuthUrl: vi.fn(),
    isOpeningRing: false,
    onAuthorizeClick: vi.fn(),
  }),
}));

// Eligibility stays 'pending' on the first paint and only becomes 'enabled' on
// HTTPS. This page is served over http, so the real hook settles on 'disabled'
// and the snapshot would miss the two-method layout staging and production
// show. Pin 'enabled', same as the landing VRT.
vi.mock('@/hooks/usePassportEligibility/usePassportEligibility', () => ({
  usePassportEligibility: () => 'enabled',
}));

vi.mock('@/hooks/usePassportAuth/usePassportAuth', () => ({
  usePassportAuth: () => ({
    startPassportAuth: vi.fn(),
    isPending: false,
  }),
}));

// Dialogs import AuthController. Keep the module from opening a session or
// IndexedDB while the closed restore buttons are on screen.
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    logout: async () => {},
    loginWithMnemonic: async () => {},
    loginWithEncryptedFile: async () => {},
  },
}));

vi.mock('@/stores/signIn/signIn.store', () => ({
  useSignInStore: createZustandLikeHook(signInState),
}));

vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: createZustandLikeHook({
    secretKey: null as string | null,
    showWelcomeDialog: false,
    setShowWelcomeDialog: () => {},
    hasHydrated: true,
    reset: vi.fn(),
  }),
}));

// Guest header. Sign-in is reached signed out.
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: createZustandLikeHook({
    currentUserPubky: null as string | null,
    session: null,
    sessionExport: null,
    hasHydrated: true,
    isLoggingOut: false,
    setShowSignInDialog: vi.fn(),
    setIsLoggingOut: vi.fn(),
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

function showReadySignIn() {
  signInState.authUrlResolved = false;
  signInState.profileChecked = false;
  signInState.bootstrapFetched = false;
  signInState.dataPersisted = false;
  signInState.homeserverSynced = false;
}

// One checklist frame that shows every step treatment: completed, running, pending.
function showSigningInProgress() {
  signInState.authUrlResolved = true;
  signInState.profileChecked = true;
  signInState.bootstrapFetched = false;
  signInState.dataPersisted = false;
  signInState.homeserverSynced = false;
}

async function renderSignIn(mode: 'ready' | 'progress', viewport: VrtViewport) {
  if (mode === 'progress') showSigningInProgress();
  else showReadySignIn();

  await preloadImages(SIGN_IN_IMAGE_URLS);
  const screen = await renderForVRT(<SignInWithHeader />, { viewport });

  if (mode === 'progress') {
    await expect.element(screen.getByText('Signing in.')).toBeVisible();
    await expect.element(screen.getByText('Verifying account')).toBeVisible();
    await expect.element(screen.getByText('Loading your data')).toBeVisible();
    await expect.element(screen.getByText('Syncing settings')).toBeVisible();
    return screen;
  }

  const methodsTestId = viewport.width >= BREAKPOINTS.md ? 'sign-in-methods' : 'sign-in-methods-mobile';
  await expect.element(screen.getByTestId(methodsTestId)).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Use recovery phrase' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Use encrypted file' })).toBeVisible();
  if (viewport.width >= BREAKPOINTS.md) {
    await expect.element(screen.getByRole('button', { name: 'Copy authentication link' })).toBeVisible();
    await expect.element(screen.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  } else {
    await expect.element(screen.getByRole('button', { name: 'Authorize with Pubky Ring' })).toBeVisible();
  }
  return screen;
}

describe('Sign-in page — visual regression', () => {
  it('renders the sign-in methods at desktop viewport', async () => {
    await renderSignIn('ready', VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('sign-in-desktop');
  });

  it('renders the sign-in methods at mobile viewport', async () => {
    await renderSignIn('ready', VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('sign-in-mobile');
  });
});

describe('Sign-in progress — visual regression', () => {
  it('renders the signing-in checklist at desktop viewport', async () => {
    await renderSignIn('progress', VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('sign-in-progress-desktop');
  });

  it('renders the signing-in checklist at mobile viewport', async () => {
    await renderSignIn('progress', VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('sign-in-progress-mobile');
  });
});
