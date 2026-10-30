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
import { DialogRestoreEncryptedFile } from '@/organisms/DialogRestoreEncryptedFile/DialogRestoreEncryptedFile';
import { DialogRestoreRecoveryPhrase } from '@/organisms/DialogRestoreRecoveryPhrase/DialogRestoreRecoveryPhrase';
import { DialogAge } from '@/organisms/DialogAge/DialogAge';
import { DialogBackup } from '@/organisms/DialogBackup/DialogBackup';
import { DialogConfirmBackup } from '@/organisms/DialogConfirmBackup/DialogConfirmBackup';
import { DialogInstallIos } from '@/organisms/DialogInstallIos/DialogInstallIos';
import { DialogLocksAuth } from '@/organisms/DialogLocksAuth/DialogLocksAuth';
import { DialogPrivacy } from '@/organisms/DialogPrivacy/DialogPrivacy';
import { DialogTerms } from '@/organisms/DialogTerms/DialogTerms';
import { DialogWelcome } from '@/organisms/DialogWelcome/DialogWelcome';
import { DialogLockContent } from '@/molecules/DialogLockContent/DialogLockContent';
import { DialogPayToUnlock } from '@/molecules/DialogPayToUnlock/DialogPayToUnlock';

// Welcome, backup reminders, legal copy, install, Locks, and pay-to-unlock.
// Sign-in is already covered in auth/DialogSignIn.vrt.test.tsx.

const VIEWPORTS = [
  ['desktop', VRT_VIEWPORT_DESKTOP],
  ['mobile', VRT_VIEWPORT_MOBILE],
] as const;

const CHROME_IMAGES = ['/pubky-logo.svg'] as const;
const BACKUP_IMAGES = ['/images/note.webp', '/images/folder.webp', '/images/keyring.webp'] as const;
const RING_EXPORT_IMAGES = [
  '/images/pubky-ring-phone.webp',
  '/images/ring-logo.svg',
  '/images/badge-apple.webp',
  '/images/badge-android.webp',
] as const;
const LOCKS_INTRO_IMAGES = ['/images/locks-intro.webp'] as const;
const LOCKS_ENABLED_IMAGES = ['/images/locks-enabled.webp'] as const;
const PAY_IMAGES = ['/images/bitkit-logo.svg', '/images/badge-apple.webp', '/images/badge-android.webp'] as const;

const flags = vi.hoisted(() => ({
  showWelcomeDialog: false,
  locksAuthenticated: false,
  paykitConnected: false,
  recoveryPhrase: 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima',
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
    mnemonic: flags.recoveryPhrase,
    clearSecrets: vi.fn(),
    secretKey: null as string | null,
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

describe('Welcome and backup dialogs — visual regression', () => {
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

  it.each(VIEWPORTS)('renders backup methods at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(<DialogBackup open onOpenChange={() => undefined} />, viewport, BACKUP_IMAGES);
    await expect.element(dialog.getByTestId('dialog-title')).toHaveTextContent('Back up your pubky');
    await expect.element(dialog.getByRole('img', { name: 'Note' })).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-backup-methods-${name}`);
  });

  it.each(VIEWPORTS)('renders the backup confirmation at %s viewport', async (name, viewport) => {
    await preloadImages(CHROME_IMAGES);
    await renderForVRT(
      <VrtDialogChrome>
        <DialogConfirmBackup />
      </VrtDialogChrome>,
      { viewport },
    );
    await page.getByRole('button', { name: 'Done' }).click();
    const dialog = page.getByTestId('dialog-content');
    await expect.element(dialog.getByTestId('dialog-title')).toHaveTextContent('All backed up?');
    await matchVrtFrameScreenshot(`dialog-backup-confirm-${name}`);
  });

  it.each(VIEWPORTS)('renders a hidden recovery phrase at %s viewport', async (name, viewport) => {
    await preloadImages([...CHROME_IMAGES, ...BACKUP_IMAGES]);
    await renderForVRT(
      <VrtDialogChrome>
        <DialogBackup open onOpenChange={() => undefined} />
      </VrtDialogChrome>,
      { viewport },
    );
    await page.getByRole('button', { name: 'Continue' }).first().click();
    await expect.element(page.getByTestId('dialog-title').filter({ hasText: 'Backup recovery phrase' })).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Reveal recovery phrase' })).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-backup-phrase-hidden-${name}`);
  });

  it.each(VIEWPORTS)('renders a revealed recovery phrase at %s viewport', async (name, viewport) => {
    await preloadImages([...CHROME_IMAGES, ...BACKUP_IMAGES]);
    await renderForVRT(
      <VrtDialogChrome>
        <DialogBackup open onOpenChange={() => undefined} />
      </VrtDialogChrome>,
      { viewport },
    );
    await page.getByRole('button', { name: 'Continue' }).first().click();
    await page.getByRole('button', { name: 'Reveal recovery phrase' }).click();
    await expect.element(page.getByText('alpha')).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Hide recovery phrase' })).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-backup-phrase-revealed-${name}`);
  });

  it.each(VIEWPORTS)('renders the encrypted-file backup at %s viewport', async (name, viewport) => {
    await preloadImages([...CHROME_IMAGES, ...BACKUP_IMAGES]);
    await renderForVRT(
      <VrtDialogChrome>
        <DialogBackup open onOpenChange={() => undefined} />
      </VrtDialogChrome>,
      { viewport },
    );
    await page.getByRole('button', { name: 'Continue' }).nth(1).click();
    await expect
      .element(page.getByTestId('dialog-title').filter({ hasText: 'Backup as encrypted file' }))
      .toBeVisible();
    await matchVrtFrameScreenshot(`dialog-backup-encrypted-${name}`);
  });

  it.each(VIEWPORTS)('renders the Pubky Ring export at %s viewport', async (name, viewport) => {
    await preloadImages([...CHROME_IMAGES, ...BACKUP_IMAGES, ...RING_EXPORT_IMAGES]);
    await renderForVRT(
      <VrtDialogChrome>
        <DialogBackup open onOpenChange={() => undefined} />
      </VrtDialogChrome>,
      { viewport },
    );
    await page.getByRole('button', { name: 'Continue' }).nth(2).click();
    const exportTitle = page.getByTestId('dialog-title').filter({ hasText: 'Import recovery phrase' });
    await expect.element(viewport.width >= 1024 ? exportTitle.first() : exportTitle.last()).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-backup-ring-export-${name}`);
  });

  it.each(VIEWPORTS)('renders restore with a recovery phrase at %s viewport', async (name, viewport) => {
    await preloadImages(CHROME_IMAGES);
    await renderForVRT(
      <VrtDialogChrome>
        <DialogRestoreRecoveryPhrase />
      </VrtDialogChrome>,
      { viewport },
    );
    await page.getByRole('button', { name: 'Use recovery phrase' }).click();
    await expect.element(page.getByTestId('dialog-title')).toHaveTextContent('Restore with recovery phrase');
    await matchVrtFrameScreenshot(`dialog-restore-phrase-${name}`);
  });

  it.each(VIEWPORTS)('renders restore with an encrypted file at %s viewport', async (name, viewport) => {
    await preloadImages(CHROME_IMAGES);
    await renderForVRT(
      <VrtDialogChrome>
        <DialogRestoreEncryptedFile onRestore={() => undefined} />
      </VrtDialogChrome>,
      { viewport },
    );
    await page.getByRole('button', { name: 'Use encrypted file' }).click();
    await expect.element(page.getByTestId('dialog-title')).toHaveTextContent('Restore with encrypted file');
    await matchVrtFrameScreenshot(`dialog-restore-file-${name}`);
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

  it.each(VIEWPORTS)('renders the terms of service at %s viewport', async (name, viewport) => {
    await preloadImages(CHROME_IMAGES);
    await renderForVRT(
      <VrtDialogChrome>
        <DialogTerms />
      </VrtDialogChrome>,
      { viewport },
    );
    await page.getByRole('button', { name: 'Terms of Service' }).click();
    await expect.element(page.getByTestId('dialog-title')).toHaveTextContent('Terms of Service');
    await matchVrtFrameScreenshot(`dialog-terms-${name}`);
  });

  it.each(VIEWPORTS)('renders the privacy policy at %s viewport', async (name, viewport) => {
    await preloadImages(CHROME_IMAGES);
    await renderForVRT(
      <VrtDialogChrome>
        <DialogPrivacy />
      </VrtDialogChrome>,
      { viewport },
    );
    await page.getByRole('button', { name: 'Privacy Policy' }).click();
    await expect.element(page.getByTestId('dialog-title')).toHaveTextContent('Privacy Policy');
    await matchVrtFrameScreenshot(`dialog-privacy-${name}`);
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
    await expect.element(dialog.getByText('Install Bitkit')).toBeVisible();
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
