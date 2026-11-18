// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import type { ReactNode } from 'react';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createZustandLikeHook } from '@/test-utils/stores';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { VrtDialogChrome } from '@/test-utils/vrt.dialog-chrome';
import { DialogAge } from '@/organisms/DialogAge/DialogAge';
import { DialogInstallIos } from '@/organisms/DialogInstallIos/DialogInstallIos';
import { DialogLocksAuth } from '@/organisms/DialogLocksAuth/DialogLocksAuth';
import { DialogWelcome } from '@/organisms/DialogWelcome/DialogWelcome';
import { DialogLockContent } from '@/molecules/DialogLockContent/DialogLockContent';
import { DialogPayToUnlock } from '@/molecules/DialogPayToUnlock/DialogPayToUnlock';

// Welcome, the age notice, install, Locks, and pay-to-unlock.
// Sign-in is already covered in auth/DialogSignIn.vrt.test.tsx.
// Terms and privacy are pages now (`/terms-of-use`, `/privacy-policy`), not dialogs.

const VIEWPORTS = [
  ['desktop', VRT_VIEWPORT_DESKTOP],
  ['mobile', VRT_VIEWPORT_MOBILE],
] as const;

const CHROME_IMAGES = ['/pubky-logo.svg'] as const;
const LOCKS_INTRO_IMAGES = ['/images/locks-intro.webp'] as const;
const LOCKS_ENABLED_IMAGES = ['/images/locks-enabled.webp'] as const;
const PAY_IMAGES = ['/images/bitkit-logo.svg', '/images/badge-apple.webp', '/images/badge-android.webp'] as const;

const flags = vi.hoisted(() => ({
  showWelcomeDialog: false,
  locksAuthenticated: false,
  paykitConnected: false,
}));

const fixtures = vi.hoisted(async () => {
  const profilesModule = await import('@/test/fixtures/feed/profiles');
  const viewerPubky = profilesModule.VRT_AUTHOR_PUBKYS.alice;
  return {
    profiles: profilesModule.VRT_AUTHOR_PROFILES,
    viewerPubky,
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
  return {
    useRouter: () => router,
    usePathname: () => '/home',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
  };
});

vi.mock('dexie-react-hooks', async () => {
  const f = await fixtures;
  return { useLiveQuery: () => f.profiles[f.viewerPubky] };
});

vi.mock('@/molecules/Toaster/toast');

vi.mock('@/stores/auth/auth.store', async () => {
  const f = await fixtures;
  const { mockRingSession } = await import('@/test-utils/pubky');
  return {
    useAuthStore: createZustandLikeHook({
      currentUserPubky: f.viewerPubky,
      session: mockRingSession(['/:rw'], f.viewerPubky),
      restoreStatus: 'ready',
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
    get showWelcomeDialog() {
      return flags.showWelcomeDialog;
    },
    setShowWelcomeDialog: (value: boolean) => {
      flags.showWelcomeDialog = value;
    },
    hasHydrated: true,
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

vi.mock('@/stores/locksAuth/locksAuth.store', () => ({
  useLocksAuthStore: (selector?: (state: { session: { id: string } | null; paykitConnected: boolean }) => unknown) => {
    const state = {
      session: flags.locksAuthenticated ? { id: 'vrt-locks-session' } : null,
      paykitConnected: flags.paykitConnected,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/hooks/useKeyboardVisible/useKeyboardVisible', () => ({
  useKeyboardVisible: () => false,
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({
    isPublicRoute: true,
    isCoreExploreRoute: true,
    isDynamicPublicRoute: false,
    isPublicExploreRoute: true,
  }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    requireAuth: (action: () => void) => action(),
    isAuthenticated: true,
    isWaiting: false,
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

vi.mock('@/hooks/useUserProfile/useUserProfile', async () => {
  const f = await fixtures;
  return {
    useUserProfile: (userId: string) => {
      const details = f.profiles[userId];
      return {
        profile: details
          ? {
              name: details.name,
              bio: details.bio ?? '',
              avatarUrl: undefined,
              publicKey: userId,
              emoji: '',
              status: '',
              link: `/profile/${userId}`,
              links: details.links,
            }
          : null,
        isLoading: false as const,
      };
    },
  };
});

vi.mock('@/hooks/useAvatarUrl/useAvatarUrl', () => ({
  useAvatarUrl: (userDetails: { image: string | null } | null | undefined) => userDetails?.image ?? null,
}));

vi.mock('@/hooks/useHotTags/useHotTags', () => {
  const result = { tags: [], rawTags: [], isLoading: false, error: null, refetch: async () => {} };
  return { useHotTags: () => result };
});

vi.mock('@/hooks/useSearchAutocomplete/useSearchAutocomplete', () => {
  const result = { tags: [], users: [], isLoading: false, error: null };
  return { useSearchAutocomplete: () => result };
});

vi.mock('@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade', () => ({
  useSessionNeedsUpgrade: () => false,
}));

vi.mock('@/hooks/useLocksAuthFlow/useLocksAuthFlow', () => ({
  useLocksAuthFlow: () => ({
    status: 'idle',
    connectUrl: null,
    session: null,
    error: null,
    iframeRef: { current: null },
    prepare: async () => {},
    start: async () => {},
    reset: () => {},
  }),
}));

vi.mock('@/hooks/usePaykitSetupFlow/usePaykitSetupFlow', () => ({
  usePaykitSetupFlow: () => ({
    status: 'idle',
    setupUrl: null,
    error: null,
    iframeRef: { current: null },
    check: async () => {},
    start: () => {},
    reset: () => {},
  }),
}));

vi.mock('@/hooks/useSatUsdRate/useSatUsdRate', () => ({
  useBtcRate: () => ({
    rate: { satUsd: 0.0005, btcUsd: 50_000, lastUpdatedAt: new Date('2026-01-01T00:00:00.000Z') },
    status: 'ready' as const,
  }),
}));

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: () => null,
  },
}));

async function renderDialog(
  ui: ReactNode,
  viewport: { width: number; height: number },
  images: readonly string[] = [],
) {
  await preloadImages([...CHROME_IMAGES, ...images]);
  await renderForVRT(<VrtDialogChrome>{ui}</VrtDialogChrome>, { viewport });
  const dialog = page.getByTestId('dialog-content');
  await expect.element(dialog).toBeVisible();
  return dialog;
}

describe('Welcome dialog — visual regression', () => {
  beforeEach(() => {
    flags.showWelcomeDialog = false;
    flags.locksAuthenticated = false;
    flags.paykitConnected = false;
  });

  it.each(VIEWPORTS)('renders the welcome dialog at %s viewport', async (name, viewport) => {
    flags.showWelcomeDialog = true;
    const dialog = await renderDialog(<DialogWelcome />, viewport);
    await expect.element(dialog.getByTestId('dialog-title')).toHaveTextContent('Welcome to Pubky!');
    await expect.element(dialog.getByText('Alice Mercado')).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-welcome-${name}`);
  });
});

describe('Legal and install dialogs — visual regression', () => {
  it.each(VIEWPORTS)('renders the age notice at %s viewport', async (name, viewport) => {
    await preloadImages(CHROME_IMAGES);
    await renderForVRT(
      <VrtDialogChrome>
        <DialogAge />
      </VrtDialogChrome>,
      { viewport },
    );
    await page.getByRole('button', { name: 'over 18 years old.' }).click();
    await expect.element(page.getByTestId('dialog-title')).toHaveTextContent('Age minimum: 18');
    await matchVrtFrameScreenshot(`dialog-age-${name}`);
  });

  it.each(VIEWPORTS)('renders the iOS install steps at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <DialogInstallIos open onOpenChange={() => undefined} onConfirm={() => undefined} />,
      viewport,
    );
    await expect.element(dialog.getByTestId('dialog-title')).toHaveTextContent('Install Pubky');
    await matchVrtFrameScreenshot(`dialog-install-ios-${name}`);
  });
});

describe('Locks dialogs — visual regression', () => {
  beforeEach(() => {
    flags.locksAuthenticated = false;
    flags.paykitConnected = false;
  });

  it.each(VIEWPORTS)('renders the Locks intro at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <DialogLocksAuth open onOpenChange={() => undefined} onSuccess={() => undefined} />,
      viewport,
      LOCKS_INTRO_IMAGES,
    );
    await expect.element(dialog.getByTestId('dialog-title')).toHaveTextContent('Lock Content');
    await expect.element(dialog.getByRole('button', { name: 'Continue' })).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-locks-intro-${name}`);
  });

  it.each(VIEWPORTS)('renders Locks enabled at %s viewport', async (name, viewport) => {
    flags.locksAuthenticated = true;
    flags.paykitConnected = true;
    const dialog = await renderDialog(
      <DialogLocksAuth open onOpenChange={() => undefined} onSuccess={() => undefined} />,
      viewport,
      LOCKS_ENABLED_IMAGES,
    );
    await expect.element(dialog.getByTestId('dialog-title')).toHaveTextContent('Locks Enabled');
    await matchVrtFrameScreenshot(`dialog-locks-enabled-${name}`);
  });

  it.each(VIEWPORTS)('renders an empty lock price at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <DialogLockContent open onOpenChange={() => undefined} onApplied={() => undefined} />,
      viewport,
    );
    await expect.element(dialog.getByTestId('dialog-title')).toHaveTextContent('Lock Content');
    await expect.element(dialog.getByPlaceholder('0')).toHaveValue('');
    await matchVrtFrameScreenshot(`dialog-lock-price-empty-${name}`);
  });

  it.each(VIEWPORTS)('renders a lock price at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <DialogLockContent open onOpenChange={() => undefined} onApplied={() => undefined} />,
      viewport,
    );
    const amount = dialog.getByPlaceholder('0');
    await amount.fill('21000');
    // Grouped sats are the resting value. Focus shows the raw digits, so leave the field before the capture.
    const field = amount.element();
    if (!(field instanceof HTMLInputElement)) {
      throw new Error('Lock amount field is not an input');
    }
    field.blur();
    await expect.element(amount).toHaveValue('21,000');
    await expect.element(dialog.getByText('$10.50')).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-lock-price-filled-${name}`);
  });

  it.each(VIEWPORTS)('renders pay to unlock before a wallet is installed at %s viewport', async (name, viewport) => {
    const f = await fixtures;
    const dialog = await renderDialog(
      <DialogPayToUnlock
        open
        onOpenChange={() => undefined}
        lockTitle="Field notes"
        authorId={f.viewerPubky}
        price={{ asset: 'BTC', amount: '21000' }}
        stage="install"
        isStalled={false}
        handshakePubky={null}
        connectionState={null}
        isConnectionPending={false}
        walletSetupNeeded={false}
        isSubmitting={false}
        onRetry={() => undefined}
        onRecheck={() => undefined}
        onViewContent={() => undefined}
      />,
      viewport,
      PAY_IMAGES,
    );
    await expect.element(dialog.getByRole('heading', { name: 'Pay to Unlock' })).toBeVisible();
    // The step element is "1) Install Bitkit". Vitest matches that whole string.
    await expect.element(dialog.getByText('1) Install Bitkit')).toBeVisible();
    await expect.element(dialog.getByRole('button', { name: 'I completed the steps' })).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-pay-to-unlock-install-${name}`);
  });

  it.each(VIEWPORTS)('renders pay to unlock waiting for Bitkit at %s viewport', async (name, viewport) => {
    const f = await fixtures;
    const dialog = await renderDialog(
      <DialogPayToUnlock
        open
        onOpenChange={() => undefined}
        lockTitle="Field notes"
        authorId={f.viewerPubky}
        price={{ asset: 'BTC', amount: '21000' }}
        stage="waiting"
        isStalled={false}
        handshakePubky={f.viewerPubky}
        connectionState={null}
        isConnectionPending={false}
        walletSetupNeeded={false}
        isSubmitting={false}
        onRetry={() => undefined}
        onRecheck={() => undefined}
        onViewContent={() => undefined}
      />,
      viewport,
    );
    await expect.element(dialog.getByText('Field notes')).toBeVisible();
    if (viewport.width >= 1024) {
      await expect.element(dialog.getByRole('button', { name: 'Copy creator pubky' })).toBeVisible();
    } else {
      await expect.element(dialog.getByRole('link', { name: 'Open in Bitkit' })).toBeVisible();
    }
    await matchVrtFrameScreenshot(`dialog-pay-to-unlock-waiting-${name}`);
  });
});
