// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { cdp, page, server } from 'vitest/browser';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook, mockSettingsStore } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import ShopLayout from '@/app/shop/layout';

// Render real App desktop/mobile chrome around deterministic Shop fixture content.
const routeState = vi.hoisted(() => ({
  pathname: '/shop',
  unavailable: false,
  upgradeOpen: false,
  signedIn: true,
  loading: false,
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
      get currentUserPubky() {
        return routeState.signedIn ? f.viewerPubky : null;
      },
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
    isPublicRoute: true,
    isCoreExploreRoute: false,
    isDynamicPublicRoute: true,
    isPublicExploreRoute: true,
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
    isOpeningBitkit: false,
    fetchUrl: vi.fn(),
    onAuthorizeClick: vi.fn(),
    onAuthorizeBitkitClick: vi.fn(),
  }),
}));

vi.mock('@/hooks/useShopEmbed/useShopEmbed', () => ({
  useShopEmbed: () => ({
    iframe: { current: null },
    // A real iframe with deterministic local content: no Shop server, auth, signer or payment dependency.
    initialSrc: routeState.loading
      ? null
      : `data:text/html,${encodeURIComponent('<!doctype html><html><body style="margin:0;padding:24px;background:transparent;color:white;font:16px sans-serif"><h1>Shop fixture</h1><p>Marketplace content</p></body></html>')}`,
    unavailable: routeState.unavailable,
    upgradeOpen: routeState.upgradeOpen,
    closeUpgrade: () => {},
    requestLogin: () => {},
    handleFrameLoad: () => {},
  }),
}));
async function renderShop(
  viewport: { width: number; height: number },
  {
    unavailable = false,
    upgradeOpen = false,
    signedIn = true,
    loading = false,
  }: { unavailable?: boolean; upgradeOpen?: boolean; signedIn?: boolean; loading?: boolean } = {},
) {
  routeState.unavailable = unavailable;
  routeState.upgradeOpen = upgradeOpen;
  routeState.signedIn = signedIn;
  routeState.loading = loading;
  await preloadImages(SHOP_CHROME_IMAGE_URLS);
  return renderForVRT(
    <>
      <Header />
      <ShopLayout>{null}</ShopLayout>
    </>,
    { viewport },
  );
}

async function withUnclippedDocument(root: HTMLElement | SVGElement, check: () => Promise<void>) {
  const elements = [root, document.documentElement, document.body];
  const originalStyles = elements.map((element) => element.style.cssText);
  try {
    // Undo the screenshot harness's clipping: an overflowing page must fail
    // these geometry checks instead of merely being cropped to the viewport.
    root.style.width = '100%';
    root.style.height = 'auto';
    root.style.overflow = 'visible';
    document.documentElement.style.setProperty('overflow', 'visible', 'important');
    document.body.style.setProperty('overflow-y', 'auto', 'important');
    await check();
  } finally {
    elements.forEach((element, index) => {
      element.style.cssText = originalStyles[index];
    });
  }
}

function expectShopViewport(root: HTMLElement | SVGElement, content: HTMLElement) {
  const shell = root.querySelector<HTMLElement>('[data-testid="shop-shell"]')!;
  const bounds = content.getBoundingClientRect();
  const desktop = window.matchMedia('(min-width: 1024px)').matches;
  const header = desktop ? root.querySelector('header')! : shell.firstElementChild!;
  const footer = shell.querySelector('a[aria-label="Home"]')!.parentElement!.parentElement!;
  const bottom = desktop ? window.innerHeight : footer.getBoundingClientRect().top;

  expect(bounds.top).toBeCloseTo(header.getBoundingClientRect().bottom, 0);
  expect(bounds.bottom).toBeCloseTo(bottom, 0);
  expect(bounds.height).toBeGreaterThan(0);
  if (desktop) {
    expect(bounds.left).toBeGreaterThan(0);
    expect(bounds.width).toBeLessThanOrEqual(1200);
    expect(window.innerWidth - bounds.right).toBeCloseTo(bounds.left, 0);
  } else {
    expect(bounds.left).toBeCloseTo(0, 0);
    expect(bounds.width).toBeCloseTo(window.innerWidth, 0);
    expect(footer.getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight, 0);
  }
  expect(shell.getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight, 0);
  expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(window.innerHeight + 1);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  expect(window.scrollY).toBe(0);
  return bounds;
}

async function resizeShopViewport(width: number, height: number) {
  // The Vitest viewport acknowledgment has no timeout of its own.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      page.viewport(width, height),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Shop viewport resize timed out (${width}x${height})`)), 5_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
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
  it.each([
    { name: 'portrait', viewport: VRT_VIEWPORT_MOBILE, signedIn: true },
    { name: 'landscape', viewport: { width: 844, height: 390 }, signedIn: true },
    { name: 'guest portrait', viewport: VRT_VIEWPORT_MOBILE, signedIn: false },
    { name: 'guest landscape', viewport: { width: 844, height: 390 }, signedIn: false },
    { name: 'desktop', viewport: VRT_VIEWPORT_DESKTOP, signedIn: true },
    { name: 'guest desktop', viewport: VRT_VIEWPORT_DESKTOP, signedIn: false },
    { name: 'tall desktop', viewport: { width: 1728, height: 1080 }, signedIn: true },
    { name: 'guest tall desktop', viewport: { width: 1728, height: 1080 }, signedIn: false },
    { name: 'short desktop', viewport: { width: 1024, height: 600 }, signedIn: true },
    { name: 'guest short desktop', viewport: { width: 1024, height: 600 }, signedIn: false },
  ])('keeps one reachable Shop scroll area in $name', async ({ viewport, signedIn }) => {
    const screen = await renderShop(viewport, { signedIn });
    const root = screen.getByTestId(VRT_ROOT_TESTID).element();
    const frame = screen.getByTitle('Pubky Shop').element() as HTMLIFrameElement;
    await withUnclippedDocument(root, async () => {
      frame.srcdoc = `<!doctype html><html><body style="margin:0;min-width:375px">
        <main style="box-sizing:border-box;padding:24px">
          <h1>Long marketplace listing</h1>
          <div style="height:2400px">Listing details</div>
          <button id="checkout">Continue to checkout</button>
        </main></body></html>`;
      await expect.poll(() => Boolean(frame.contentDocument?.getElementById('checkout'))).toBe(true);
      expectShopViewport(root, frame);
      expect(frame.contentDocument!.documentElement.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);
      if (!signedIn) await expect.element(screen.getByRole('button', { name: 'Join Pubky' })).toBeVisible();

      const child = frame.contentWindow!;
      child.scrollTo(0, frame.contentDocument!.documentElement.scrollHeight);
      await expect.poll(() => child.scrollY).toBeGreaterThan(viewport.height);
      const checkout = frame.contentDocument!.getElementById('checkout')!.getBoundingClientRect();
      expect(checkout.top).toBeGreaterThanOrEqual(0);
      expect(checkout.bottom).toBeLessThanOrEqual(frame.clientHeight);
      // The final action must receive pointer hits inside the child viewport.
      expect(
        frame.contentDocument!.elementFromPoint(checkout.left + checkout.width / 2, checkout.top + checkout.height / 2)
          ?.id,
      ).toBe('checkout');
      expectShopViewport(root, frame);
    });
  });
  it.each([
    { name: 'desktop', viewport: VRT_VIEWPORT_DESKTOP, signedIn: true },
    { name: 'guest short desktop', viewport: { width: 1024, height: 600 }, signedIn: false },
    { name: 'portrait', viewport: VRT_VIEWPORT_MOBILE, signedIn: true },
    { name: 'guest landscape', viewport: { width: 844, height: 390 }, signedIn: false },
  ])('fills the available Shop viewport while loading in $name', async ({ viewport, signedIn }) => {
    const screen = await renderShop(viewport, { signedIn, loading: true });
    const root = screen.getByTestId(VRT_ROOT_TESTID).element();
    const skeleton = screen.getByTestId('shop-shell').element().querySelector<HTMLElement>('[data-slot="skeleton"]')!;
    await withUnclippedDocument(root, async () => {
      expectShopViewport(root, skeleton);
      expect(root.querySelector('iframe')).toBeNull();
    });
  });
  it('keeps the same iframe and its document when resizing across desktop breakpoints', async () => {
    const screen = await renderShop(VRT_VIEWPORT_DESKTOP);
    const root = screen.getByTestId(VRT_ROOT_TESTID).element();
    const frame = screen.getByTitle('Pubky Shop').element() as HTMLIFrameElement;
    await withUnclippedDocument(root, async () => {
      frame.srcdoc = '<!doctype html><html><body><input id="draft" value="Retain this draft"></body></html>';
      await expect.poll(() => Boolean(frame.contentDocument?.getElementById('draft'))).toBe(true);
      const childDocument = frame.contentDocument;
      for (const viewport of [
        { width: 1023, height: 600 },
        { width: 1024, height: 600 },
        { width: 1279, height: 720 },
        { width: 1280, height: 720 },
        VRT_VIEWPORT_MOBILE,
        { width: 1728, height: 906 },
      ]) {
        await resizeShopViewport(viewport.width, viewport.height);
        await expect.poll(() => window.innerWidth).toBe(viewport.width);
        expectShopViewport(root, frame);
        expect(screen.getByTitle('Pubky Shop').element()).toBe(frame);
        expect(frame.contentDocument).toBe(childDocument);
        expect(frame.contentDocument!.querySelector<HTMLInputElement>('#draft')!.value).toBe('Retain this draft');
      }
    });
  });
  it('renders the unavailable Shop in the desktop App shell', async () => {
    const screen = await renderShop(VRT_VIEWPORT_DESKTOP, { unavailable: true });
    await expect.element(screen.getByRole('heading', { name: 'Shop unavailable' })).toBeVisible();
    await matchVrtFrameScreenshot('shop-unavailable-desktop');
  });
  it('renders the unavailable Shop in the mobile App shell', async () => {
    const screen = await renderShop(VRT_VIEWPORT_MOBILE, { unavailable: true });
    await expect.element(screen.getByRole('heading', { name: 'Shop unavailable' })).toBeVisible();
    await matchVrtFrameScreenshot('shop-unavailable-mobile');
  });
  it('renders the Enable Shop dialog in the desktop App shell', async () => {
    await renderShop(VRT_VIEWPORT_DESKTOP, { upgradeOpen: true });
    await expect.element(page.getByRole('dialog', { name: 'Enable Shop' })).toBeVisible();
    await expect.element(page.getByTestId('session-upgrade-qr')).toBeVisible();
    await expect
      .element(page.getByRole('button', { name: 'Continue with Pubky Ring', includeHidden: true }))
      .not.toBeVisible();
    await expect
      .element(page.getByRole('button', { name: 'Continue with Bitkit', includeHidden: true }))
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
        await renderShop(VRT_VIEWPORT_MOBILE, { upgradeOpen: true });
        await expect.element(page.getByRole('dialog', { name: 'Enable Shop' })).toBeVisible();
        await expect.element(page.getByRole('button', { name: 'Continue with Pubky Ring' })).toBeVisible();
        await expect.element(page.getByRole('button', { name: 'Continue with Bitkit' })).toBeVisible();
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
