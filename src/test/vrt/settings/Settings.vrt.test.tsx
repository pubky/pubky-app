// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook, mockSettingsStore } from '@/test-utils/stores';
import { SETTINGS_ROUTES } from '@/app/routes';
import { Header } from '@/organisms/Header/Header';
import { Settings as SettingsLayout } from '@/templates/Settings/Settings';
import { Account } from '@/templates/Settings/Account/Account';
import { EditProfile } from '@/templates/Settings/EditProfile/EditProfile';
import { Help } from '@/templates/Settings/Help/Help';
import { MutedUsers } from '@/templates/Settings/MutedUsers/MutedUsers';
import { Notifications } from '@/templates/Settings/Notifications/Notifications';
import { Privacy } from '@/templates/Settings/Privacy/Privacy';

// Covers tabs: account, edit profile, notifications, privacy & safety, muted users, help.
const routeState = vi.hoisted(() => ({
  pathname: '/settings/account',
}));

const SETTINGS_CHROME_IMAGE_URLS = [
  '/pubky-logo.svg',
  '/images/synonym-white-logo.svg',
  '/images/a-tether-company.svg',
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

vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
  toast: vi.fn(),
}));

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
  return {
    useAuthStore: createZustandLikeHook({
      currentUserPubky: f.viewerPubky,
      session: { pubky: f.viewerPubky },
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

vi.mock('@/hooks/useKeyboardOffset/useKeyboardOffset', () => ({
  useKeyboardOffset: () => ({ isKeyboardVisible: false, keyboardOffset: 0 }),
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

vi.mock('@/hooks/useCollectionsNavDiscovery/useCollectionsNavDiscovery', () => ({
  useCollectionsNavDiscovery: () => ({
    showCollectionsNew: false,
    markCollectionsNavSeen: () => {},
  }),
}));

vi.mock('@/hooks/useSignOut/useSignOut', () => ({
  useSignOut: () => ({ handleSignOut: async () => {}, isLoading: false }),
}));

vi.mock('@/hooks/useSettingsActions/useSettingsActions', () => {
  const noop = () => {};
  const result = {
    setNotificationPreference: noop,
    setShowConfirm: noop,
    setBlurCensored: noop,
    setSignOutInactive: noop,
    setRequirePin: noop,
    setHideWhoToFollow: noop,
    setHideActiveFriends: noop,
    setHideSearch: noop,
    setNeverShowPosts: noop,
    error: null as string | null,
  };
  return { useSettingsActions: () => result };
});

vi.mock('@/hooks/useMutedUsers/useMutedUsers', async () => {
  const f = await fixtures;
  const mutedUserIds = f.mutedUserIds;
  const mutedUserIdSet = new Set(mutedUserIds);
  const result = {
    mutedUserIds,
    mutedUserIdSet,
    isMuted: (id: string) => mutedUserIdSet.has(id),
    isLoading: false,
  };
  return { useMutedUsers: () => result };
});

vi.mock('@/hooks/useBulkUserAvatars/useBulkUserAvatars', async () => {
  const f = await fixtures;
  const result = {
    usersMap: f.mutedUsersMap,
    getUsersWithAvatars: (ids: string[]) => ids.map((id) => f.mutedUsersMap.get(id) ?? { id }),
    isLoading: false,
  };
  return { useBulkUserAvatars: () => result };
});

vi.mock('@/hooks/useMuteUser/useMuteUser', () => {
  const result = {
    toggleMute: async () => {},
    isLoading: false,
    loadingUserId: null as string | null,
    isUserLoading: () => false,
    error: null as string | null,
  };
  return { useMuteUser: () => result };
});

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: () => null,
  },
}));

function SettingsWithChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <SettingsLayout>{children}</SettingsLayout>
    </>
  );
}

function EditProfileWithChrome() {
  return (
    <>
      <Header />
      <EditProfile />
    </>
  );
}

async function renderSettingsTab(pathname: string, page: React.ReactNode, viewport: { width: number; height: number }) {
  routeState.pathname = pathname;
  await preloadImages(SETTINGS_CHROME_IMAGE_URLS);
  return renderForVRT(<SettingsWithChrome>{page}</SettingsWithChrome>, { viewport });
}

describe('Settings — account — visual regression', () => {
  it('renders account at desktop viewport', async () => {
    const screen = await renderSettingsTab(SETTINGS_ROUTES.ACCOUNT, <Account />, VRT_VIEWPORT_DESKTOP);
    await expect.element(screen.getByText('Sign out from Pubky')).toBeVisible();
    await matchVrtFrameScreenshot('settings-account-desktop');
  });

  it('renders account at mobile viewport', async () => {
    const screen = await renderSettingsTab(SETTINGS_ROUTES.ACCOUNT, <Account />, VRT_VIEWPORT_MOBILE);
    await expect.element(screen.getByText('Sign out from Pubky')).toBeVisible();
    await matchVrtFrameScreenshot('settings-account-mobile');
  });
});

describe('Settings — edit profile — visual regression', () => {
  // `/settings/edit` uses OnboardingLayout, not the Settings shell (Account
  // links here). Header still mounts from the root layout.
  async function renderEditProfile(viewport: { width: number; height: number }) {
    routeState.pathname = SETTINGS_ROUTES.EDIT;
    await preloadImages(SETTINGS_CHROME_IMAGE_URLS);
    const screen = await renderForVRT(<EditProfileWithChrome />, { viewport });
    await expect.element(screen.getByTestId('edit-profile-form')).toBeVisible();
    await expect.element(screen.getByPlaceholder('Enter your name')).toHaveValue('Alice Mercado');
    return screen;
  }

  it('renders edit profile at desktop viewport', async () => {
    await renderEditProfile(VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('settings-edit-profile-desktop');
  });

  it('renders edit profile at mobile viewport', async () => {
    await renderEditProfile(VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('settings-edit-profile-mobile');
  });
});

describe('Settings — notifications — visual regression', () => {
  it('renders notifications at desktop viewport', async () => {
    const screen = await renderSettingsTab(SETTINGS_ROUTES.NOTIFICATIONS, <Notifications />, VRT_VIEWPORT_DESKTOP);
    await expect.element(screen.getByText('Platform notifications')).toBeVisible();
    await matchVrtFrameScreenshot('settings-notifications-desktop');
  });

  it('renders notifications at mobile viewport', async () => {
    const screen = await renderSettingsTab(SETTINGS_ROUTES.NOTIFICATIONS, <Notifications />, VRT_VIEWPORT_MOBILE);
    await expect.element(screen.getByText('Platform notifications')).toBeVisible();
    await matchVrtFrameScreenshot('settings-notifications-mobile');
  });
});

describe('Settings — privacy & safety — visual regression', () => {
  it('renders privacy and safety at desktop viewport', async () => {
    const screen = await renderSettingsTab(SETTINGS_ROUTES.PRIVACY_SAFETY, <Privacy />, VRT_VIEWPORT_DESKTOP);
    await expect.element(screen.getByText(/Privacy is not a crime/)).toBeVisible();
    await matchVrtFrameScreenshot('settings-privacy-safety-desktop');
  });

  it('renders privacy and safety at mobile viewport', async () => {
    const screen = await renderSettingsTab(SETTINGS_ROUTES.PRIVACY_SAFETY, <Privacy />, VRT_VIEWPORT_MOBILE);
    await expect.element(screen.getByText(/Privacy is not a crime/)).toBeVisible();
    await matchVrtFrameScreenshot('settings-privacy-safety-mobile');
  });
});

describe('Settings — muted users — visual regression', () => {
  it('renders muted users at desktop viewport', async () => {
    const screen = await renderSettingsTab(SETTINGS_ROUTES.MUTED_USERS, <MutedUsers />, VRT_VIEWPORT_DESKTOP);
    await expect.element(screen.getByText('Bran Ó Conaill')).toBeVisible();
    await expect.element(screen.getByText('Unmute all users')).toBeVisible();
    await matchVrtFrameScreenshot('settings-muted-users-desktop');
  });

  it('renders muted users at mobile viewport', async () => {
    const screen = await renderSettingsTab(SETTINGS_ROUTES.MUTED_USERS, <MutedUsers />, VRT_VIEWPORT_MOBILE);
    await expect.element(screen.getByText('Bran Ó Conaill')).toBeVisible();
    await expect.element(screen.getByText('Unmute all users')).toBeVisible();
    await matchVrtFrameScreenshot('settings-muted-users-mobile');
  });
});

describe('Settings — help — visual regression', () => {
  it('renders help at desktop viewport', async () => {
    const screen = await renderSettingsTab(SETTINGS_ROUTES.HELP, <Help />, VRT_VIEWPORT_DESKTOP);
    await expect.element(screen.getByText('1. Getting Started & Onboarding')).toBeVisible();
    await matchVrtFrameScreenshot('settings-help-desktop');
  });

  it('renders help at mobile viewport', async () => {
    const screen = await renderSettingsTab(SETTINGS_ROUTES.HELP, <Help />, VRT_VIEWPORT_MOBILE);
    await expect.element(screen.getByText('1. Getting Started & Onboarding')).toBeVisible();
    await matchVrtFrameScreenshot('settings-help-mobile');
  });
});
