// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { cdp, page, server } from 'vitest/browser';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook, mockSettingsStore } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import ShopLayout from '@/app/shop/layout';

// Render real App desktop/mobile chrome around deterministic Shop fixture content.
const routeState = vi.hoisted(() => ({
  pathname: '/shop',
  unavailable: false,
  upgradeOpen: false,
}));

const SHOP_CHROME_IMAGE_URLS = [
  '/pubky-logo.svg',
  '/images/synonym-white-logo.svg',
  '/images/a-tether-company.svg',
  '/images/tagged-empty-state.webp',
] as const;

const fixtures = vi.hoisted(async () => {
  const [profilesModule, preferencesModule] = await Promise.all([
    import('@/test/fixtures/feed/profiles'),
    import('@/test/fixtures/settings/preferences'),
  ]);
  const viewerPubky = profilesModule.VRT_AUTHOR_PUBKYS.alice;
  const mutedUserIds = [...preferencesModule.VRT_MUTED_PUBKYS];
  const mutedUsersMap = new Map(
    mutedUserIds.map((id) => {
      const profile = profilesModule.VRT_AUTHOR_PROFILES[id];
      return [id, { id, name: profile.name, avatarUrl: undefined as string | undefined }] as const;
    }),
  );
  return {
    profiles: profilesModule.VRT_AUTHOR_PROFILES,
    viewerPubky,
    notifications: preferencesModule.VRT_SETTINGS_NOTIFICATIONS,
    privacy: preferencesModule.VRT_SETTINGS_PRIVACY,
    mutedUserIds,
    mutedUsersMap,
  };
});

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
    usePathname: () => routeState.pathname,
    useSearchParams: () => searchParams,
    useParams: () => ({}),
  };
});

vi.mock('@/molecules/Toaster/toast');

vi.mock('@/stores/home/home.store', () => {
  return {
    useHomeStore: createZustandLikeHook({
      layout: 'columns' as const,
      sort: 'recent' as const,
      reach: 'all' as const,
      content: 'all' as const,
      profileTags: [] as string[],
      taggedAsActive: false,
      hasHydrated: true,
      setLayout: vi.fn(),
      setSort: vi.fn(),
      setReach: vi.fn(),
      setTaggedAsActive: vi.fn(),
      applyDefaultReach: vi.fn(),
      setContent: vi.fn(),
      setProfileTags: vi.fn(),
      addProfileTag: vi.fn(),
      removeProfileTag: vi.fn(),
      clearProfileTags: vi.fn(),
      setHasHydrated: vi.fn(),
      reset: vi.fn(),
    }),
  };
});

vi.mock('@/stores/auth/auth.store', async () => {
  const f = await fixtures;
  const { mockRingSession } = await import('@/test-utils/pubky');
  return {
    useAuthStore: createZustandLikeHook({
      currentUserPubky: f.viewerPubky,
      session: mockRingSession(['/:rw'], f.viewerPubky),
      sessionExport: null,
      hasProfile: true,
      hasHydrated: true,
      isRestoringSession: false,
      isLoggingOut: false,
      setShowSignInDialog: vi.fn(),
      selectCurrentUserPubky: () => f.viewerPubky,
    }),
  };
});

vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: createZustandLikeHook({
    secretKey: null as string | null,
    showWelcomeDialog: false,
    setShowWelcomeDialog: () => {},
    hasHydrated: true,
  }),
}));

vi.mock('@/stores/migration/migration.store', () => ({
  useMigrationStore: createZustandLikeHook({
    wasDbReset: false,
    setWasDbReset: () => {},
  }),
}));

vi.mock('@/stores/notification/notification.store', () => ({
  useNotificationStore: createZustandLikeHook({
    selectUnread: () => 0,
  }),
}));

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: createZustandLikeHook({
    profile: null,
    posts: {} as Record<string, never>,
    collections: {} as Record<string, never>,
  }),
}));

vi.mock('@/stores/settings/settings.store', async () => {
  const f = await fixtures;
  return {
    useSettingsStore: createZustandLikeHook(
      mockSettingsStore({
        notifications: f.notifications,
        privacy: f.privacy,
        muted: f.mutedUserIds,
      }),
    ),
  };
});

vi.mock('@/hooks/useKeyboardVisible/useKeyboardVisible', () => ({
  useKeyboardVisible: () => false,
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({
    isPublicRoute: false,
    isCoreExploreRoute: false,
    isDynamicPublicRoute: false,
    isPublicExploreRoute: false,
  }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    requireAuth: (action: () => void) => action(),
    isAuthenticated: true,
    waitForAuth: async () => true,
  }),
}));

vi.mock('@/hooks/useAuthStatus/useAuthStatus', async () => {
  const types =
    (await import('@/hooks/useAuthStatus/useAuthStatus.types')) as typeof import('@/hooks/useAuthStatus/useAuthStatus.types');
  const result = {
    status: types.AuthStatus.AUTHENTICATED,
    isLoading: false,
    hasKeypair: true,
    hasProfile: true,
    isFullyAuthenticated: true,
  };
  return { useAuthStatus: () => result };
});

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', async () => {
  const f = await fixtures;
  const result = {
    userDetails: f.profiles[f.viewerPubky],
    currentUserPubky: f.viewerPubky,
    isLoading: false,
  };
  return { useCurrentUserProfile: () => result };
});

vi.mock('@/hooks/useAvatarUrl/useAvatarUrl', () => ({
  useAvatarUrl: (userDetails: { image: string | null } | null | undefined) => userDetails?.image ?? null,
}));

vi.mock('@/hooks/useCustomFeed/useCustomFeed', () => {
  const result = { feed: null, isLoading: false };
  return { useCustomFeed: () => result };
});

vi.mock('@/hooks/useHotTags/useHotTags', () => {
  const result = { tags: [], rawTags: [], isLoading: false, error: null, refetch: async () => {} };
  return { useHotTags: () => result };
});

vi.mock('@/hooks/useSearchAutocomplete/useSearchAutocomplete', () => {
  const result = { tags: [], users: [], isLoading: false, error: null };
  return { useSearchAutocomplete: () => result };
});

vi.mock('@/hooks/useSignOut/useSignOut', () => ({
  useSignOut: () => ({ handleSignOut: async () => {}, isLoading: false }),
}));

// Keep the real upgrade dialog and QR panel; only replace the signer request boundary.
vi.mock('@/hooks/useMobileAuth/useMobileAuth', () => ({
  useMobileAuth: () => ({
    url: 'pubkyauth://signin_grant?relay=https%3A%2F%2Frelay.example&client_id=pubky.app&caps=%2Fpub%2Fpaykit%2F%3Arw',
    isLoading: false,
    isExpired: false,
    isOpeningRing: false,
    fetchUrl: vi.fn(),
    onAuthorizeClick: vi.fn(),
  }),
}));

vi.mock('@/hooks/useShopEmbed/useShopEmbed', () => ({
  useShopEmbed: () => ({
    iframe: { current: null },
    // A real iframe with deterministic local content: no Shop server, auth, signer or payment dependency.
    initialSrc: `data:text/html,${encodeURIComponent('<!doctype html><html><body style="margin:0;padding:24px;background:transparent;color:white;font:16px sans-serif"><h1>Shop fixture</h1><p>Marketplace content</p></body></html>')}`,
    unavailable: routeState.unavailable,
    upgradeOpen: routeState.upgradeOpen,
    closeUpgrade: () => {},
    requestLogin: () => {},
    handleFrameLoad: () => {},
  }),
}));
async function renderShop(viewport: { width: number; height: number }, unavailable = false, upgradeOpen = false) {
  routeState.unavailable = unavailable;
  routeState.upgradeOpen = upgradeOpen;
  await preloadImages(SHOP_CHROME_IMAGE_URLS);
  return renderForVRT(
    <>
      <Header />
      <ShopLayout>{null}</ShopLayout>
    </>,
    { viewport },
  );
}

describe('embedded Shop shell — visual regression', () => {
  it('renders desktop App navigation and the embedded content boundary', async () => {
    const screen = await renderShop(VRT_VIEWPORT_DESKTOP);
    await expect.element(screen.getByTitle('Pubky Shop')).toBeVisible();
    await matchVrtFrameScreenshot('shop-desktop');
  });
  it('renders mobile App navigation and the embedded content boundary', async () => {
    const screen = await renderShop(VRT_VIEWPORT_MOBILE);
    await expect.element(screen.getByTitle('Pubky Shop')).toBeVisible();
    await matchVrtFrameScreenshot('shop-mobile');
  });
  it('renders the unavailable Shop in the desktop App shell', async () => {
    const screen = await renderShop(VRT_VIEWPORT_DESKTOP, true);
    await expect.element(screen.getByRole('heading', { name: 'Shop unavailable' })).toBeVisible();
    await matchVrtFrameScreenshot('shop-unavailable-desktop');
  });
  it('renders the unavailable Shop in the mobile App shell', async () => {
    const screen = await renderShop(VRT_VIEWPORT_MOBILE, true);
    await expect.element(screen.getByRole('heading', { name: 'Shop unavailable' })).toBeVisible();
    await matchVrtFrameScreenshot('shop-unavailable-mobile');
  });
  it('renders the Enable Shop dialog in the desktop App shell', async () => {
    await renderShop(VRT_VIEWPORT_DESKTOP, false, true);
    await expect.element(page.getByRole('dialog', { name: 'Enable Shop' })).toBeVisible();
    await expect.element(page.getByTestId('session-upgrade-qr')).toBeVisible();
    await expect
      .element(page.getByRole('button', { name: 'Continue with Pubky Ring', includeHidden: true }))
      .not.toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Use Passport or recovery key' })).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
    await matchVrtFrameScreenshot('shop-enable-desktop');
  });

  // Resizing alone leaves a fine pointer and captures the desktop QR. CDP changes the real
  // CSS media feature for this phone case. Our Linux Chromium CI cannot restore its native
  // pointer/hover media after disabling touch, so keep this case on macOS Chromium.
  // Other environments need a separate touch context, not a shared-page override.
  it.skipIf(server.browser !== 'chromium' || server.platform !== 'darwin')(
    'renders the Enable Shop dialog with mobile touch controls',
    async () => {
      const session = cdp();
      try {
        await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
        await expect.poll(() => window.matchMedia('(pointer: coarse)').matches).toBe(true);
        await renderShop(VRT_VIEWPORT_MOBILE, false, true);
        await expect.element(page.getByRole('dialog', { name: 'Enable Shop' })).toBeVisible();
        await expect.element(page.getByRole('button', { name: 'Continue with Pubky Ring' })).toBeVisible();
        await expect.element(page.getByTestId('session-upgrade-qr')).not.toBeVisible();
        await expect.element(page.getByRole('button', { name: 'Use Passport or recovery key' })).toBeVisible();
        await expect.element(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
        await matchVrtFrameScreenshot('shop-enable-mobile');
      } finally {
        await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
        await expect.poll(() => window.matchMedia('(pointer: fine)').matches).toBe(true);
        await expect.poll(() => window.matchMedia('(hover: hover)').matches).toBe(true);
      }
    },
  );
});
