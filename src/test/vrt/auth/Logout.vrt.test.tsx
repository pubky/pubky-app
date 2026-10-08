// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE, type VrtViewport } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { BREAKPOINTS } from '@/config/theme';
import { VRT_AUTHOR_PUBKYS } from '@/test/fixtures/feed/profiles';
import { Header } from '@/organisms/Header/Header';
import { Logout } from '@/templates/Auth/Logout/Logout';

// Header logo, plus the tag illustration on the signed-out screen.
const LOGOUT_IMAGE_URLS = ['/pubky-logo.svg', '/images/tag.webp'] as const;

type LogoutMode = 'success' | 'loading' | 'error';

// The route effect calls logout unless the visit is already signed out or a
// sign-out is already in progress. The mode selects which of those the mock does.
const logoutMode = vi.hoisted(() => ({
  value: 'success' as LogoutMode,
}));

const authState = vi.hoisted(() => {
  const state: {
    currentUserPubky: string | null;
    session: object | null;
    sessionExport: string | null;
    hasProfile: boolean;
    hasHydrated: boolean;
    isRestoringSession: boolean;
    isLoggingOut: boolean;
    setIsLoggingOut: (value: boolean) => void;
    setShowSignInDialog: () => void;
    selectCurrentUserPubky: () => string | null;
  } = {
    currentUserPubky: null,
    session: null,
    sessionExport: null,
    hasProfile: false,
    hasHydrated: true,
    isRestoringSession: false,
    isLoggingOut: false,
    setIsLoggingOut: (value: boolean) => {
      state.isLoggingOut = value;
    },
    setShowSignInDialog: () => {},
    selectCurrentUserPubky: () => state.currentUserPubky,
  };
  return state;
});

// Root layout mounts <Header /> above every page.
// Signed out: logo, "Signed out" title from md up, Learn / Explore, Sign in.
// Still signed in (loading and error): signed-in header, hidden below lg.
function LogoutWithHeader() {
  return (
    <>
      <Header />
      <Logout />
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
    usePathname: () => '/logout',
    useSearchParams: () => searchParams,
    useParams: () => ({}),
  };
});

vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    logout: () => (logoutMode.value === 'error' ? Promise.reject(new Error('vrt logout failed')) : Promise.resolve()),
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: createZustandLikeHook(authState),
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

vi.mock('@/stores/notification/notification.store', () => ({
  useNotificationStore: createZustandLikeHook({
    selectUnread: () => 0,
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

// Signed-in header avatar. image: null so it renders a stable Facehash.
vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', async () => {
  const { VRT_AUTHOR_PROFILES, VRT_AUTHOR_PUBKYS: pubkys } = await import('@/test/fixtures/feed/profiles');
  const viewerPubky = pubkys.alice;
  const result = {
    userDetails: VRT_AUTHOR_PROFILES[viewerPubky],
    currentUserPubky: viewerPubky,
    isLoading: false,
  };
  return { useCurrentUserProfile: () => result };
});

// Header → HeaderSignIn → SearchInput fetches hot tags and autocomplete on mount.
vi.mock('@/hooks/useHotTags/useHotTags', () => {
  const result = { tags: [], rawTags: [], isLoading: false, error: null, refetch: async () => {} };
  return { useHotTags: () => result };
});

vi.mock('@/hooks/useSearchAutocomplete/useSearchAutocomplete', () => {
  const result = { tags: [], users: [], isLoading: false, error: null };
  return { useSearchAutocomplete: () => result };
});

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: () => null,
  },
}));

function showSignedOut() {
  logoutMode.value = 'success';
  authState.currentUserPubky = null;
  authState.session = null;
  authState.sessionExport = null;
  authState.hasProfile = false;
  authState.hasHydrated = true;
  authState.isLoggingOut = false;
}

// Hold the in-progress screen. With isLoggingOut set, the route effect returns
// before calling logout, so the view cannot flip to success under the screenshot.
function showSigningOut() {
  logoutMode.value = 'loading';
  authState.currentUserPubky = VRT_AUTHOR_PUBKYS.alice;
  authState.session = { pubky: VRT_AUTHOR_PUBKYS.alice };
  authState.sessionExport = null;
  authState.hasProfile = true;
  authState.hasHydrated = true;
  authState.isLoggingOut = true;
}

function showLogoutError() {
  logoutMode.value = 'error';
  authState.currentUserPubky = VRT_AUTHOR_PUBKYS.alice;
  authState.session = { pubky: VRT_AUTHOR_PUBKYS.alice };
  authState.sessionExport = null;
  authState.hasProfile = true;
  authState.hasHydrated = true;
  authState.isLoggingOut = false;
}

async function renderLogout(mode: LogoutMode, viewport: VrtViewport) {
  if (mode === 'loading') showSigningOut();
  else if (mode === 'error') showLogoutError();
  else showSignedOut();

  await preloadImages(LOGOUT_IMAGE_URLS);
  const screen = await renderForVRT(<LogoutWithHeader />, { viewport });

  if (mode === 'loading') {
    await expect.element(screen.getByText('Signing you out...')).toBeVisible();
    await expect.element(screen.getByText("We're ending your session securely.")).toBeVisible();
    if (viewport.width >= BREAKPOINTS.lg) {
      await expect.element(screen.getByTestId('search-input')).toBeVisible();
    }
    return screen;
  }

  if (mode === 'error') {
    await expect.element(screen.getByText("We couldn't sign you out yet")).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Homepage' })).toBeVisible();
    return screen;
  }

  await expect.element(screen.getByText('You have securely signed out.')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Sign back in' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Homepage' })).toBeVisible();
  if (viewport.width >= BREAKPOINTS.md) {
    await expect.element(screen.getByRole('heading', { name: 'Signed out' })).toBeVisible();
  }
  return screen;
}

describe('Logout — signed out — visual regression', () => {
  it('renders the signed-out page at desktop viewport', async () => {
    await renderLogout('success', VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('logout-desktop');
  });

  it('renders the signed-out page at mobile viewport', async () => {
    await renderLogout('success', VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('logout-mobile');
  });
});

describe('Logout — signing out — visual regression', () => {
  it('renders the signing-out page at desktop viewport', async () => {
    await renderLogout('loading', VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('logout-loading-desktop');
  });

  it('renders the signing-out page at mobile viewport', async () => {
    await renderLogout('loading', VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('logout-loading-mobile');
  });
});

describe('Logout — error — visual regression', () => {
  it('renders the sign-out error page at desktop viewport', async () => {
    await renderLogout('error', VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('logout-error-desktop');
  });

  it('renders the sign-out error page at mobile viewport', async () => {
    await renderLogout('error', VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('logout-error-mobile');
  });
});
