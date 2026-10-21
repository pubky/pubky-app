// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createZustandLikeHook } from '@/test-utils/stores';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { VrtDialogChrome } from '@/test-utils/vrt.dialog-chrome';
import { useCoverImagePicker } from '@/hooks/useCoverImagePicker/useCoverImagePicker';
import {
  CREATE_COLLECTION_FORM_FIELDS,
  createCollectionFormDefaults,
  type CreateCollectionFormData,
} from '@/hooks/useCreateCollection/useCreateCollection.types';
import { DialogAddLink } from '@/organisms/DialogAddLink/DialogAddLink';
import { DialogCheckLink } from '@/organisms/DialogCheckLink/DialogCheckLink';
import { DialogCollectionsIntro } from '@/organisms/Collections/DialogCollectionsIntro/DialogCollectionsIntro';
import { DialogCollectionForm } from '@/organisms/Collections/DialogCollectionForm/DialogCollectionForm';
import { DialogDeleteAccount } from '@/organisms/Settings/DialogDeleteAccount/DialogDeleteAccount';

// Create and edit collection, add-profile-link, delete account, and the
// external-link check. Own-profile pages are already covered in Profile.vrt.test.tsx.

const VIEWPORTS = [
  ['desktop', VRT_VIEWPORT_DESKTOP],
  ['mobile', VRT_VIEWPORT_MOBILE],
] as const;

const CHROME_IMAGES = ['/pubky-logo.svg'] as const;
const COLLECTION_IMAGES = ['/images/collections-onboarding.webp'] as const;
const LINK_URL = 'https://example.com/alice';

const fixtures = vi.hoisted(async () => {
  const profilesModule = await import('@/test/fixtures/feed/profiles');
  const viewerPubky = profilesModule.VRT_AUTHOR_PUBKYS.alice;
  return { viewerPubky };
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
    usePathname: () => '/settings/edit',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
  };
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

vi.mock('@/stores/settings/settings.store', () => ({
  useSettingsStore: createZustandLikeHook({
    setShowConfirm: vi.fn(),
  }),
}));

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
  const profilesModule = await import('@/test/fixtures/feed/profiles');
  const f = await fixtures;
  const result = {
    userDetails: profilesModule.VRT_AUTHOR_PROFILES[f.viewerPubky],
    currentUserPubky: f.viewerPubky,
    isLoading: false,
  };
  return { useCurrentUserProfile: () => result };
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

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: () => null,
  },
}));

function CollectionFormDialog({
  mode,
  filled,
  withCover,
}: {
  mode: 'new' | 'edit';
  filled: boolean;
  withCover?: boolean;
}) {
  const form = useForm<CreateCollectionFormData>({
    defaultValues: filled
      ? {
          [CREATE_COLLECTION_FORM_FIELDS.NAME]: 'Field notes',
          [CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION]: 'Posts worth keeping from the people I follow.',
          [CREATE_COLLECTION_FORM_FIELDS.LAYOUT]: 'list',
        }
      : createCollectionFormDefaults,
  });
  const cover = useCoverImagePicker({
    initialPreviewUrl: withCover ? COLLECTION_IMAGES[0] : null,
  });

  return (
    <DialogCollectionForm
      open
      onOpenChange={() => undefined}
      title={mode === 'new' ? 'New Collection' : 'Edit Collection'}
      submitLabel={mode === 'new' ? 'Save collection' : 'Save changes'}
      layoutLabel={mode === 'new' ? 'Layout' : 'Default layout'}
      form={form}
      cover={cover}
      onSubmit={() => undefined}
      isSaving={false}
      coverInputId={mode === 'new' ? 'new-collection-cover-image' : 'edit-collection-cover-image'}
      disableOpenAutoFocus={mode === 'edit'}
    />
  );
}

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

describe('Collection dialogs — visual regression', () => {
  it.each(VIEWPORTS)('renders the first-collection intro at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <DialogCollectionsIntro open onOpenChange={() => undefined} onContinue={() => undefined} />,
      viewport,
      COLLECTION_IMAGES,
    );
    await expect.element(dialog.getByRole('heading', { name: 'Welcome to Collections' })).toBeVisible();
    await expect.element(dialog.getByRole('img', { name: 'Collections' })).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-collection-intro-${name}`);
  });

  it.each(VIEWPORTS)('renders an empty new collection form at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(<CollectionFormDialog mode="new" filled={false} />, viewport);
    await expect.element(dialog.getByRole('heading', { name: 'New Collection' })).toBeVisible();
    await expect.element(dialog.getByPlaceholder('Name your collection')).toHaveValue('');
    await matchVrtFrameScreenshot(`dialog-collection-new-empty-${name}`);
  });

  it.each(VIEWPORTS)('renders a filled new collection form at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(<CollectionFormDialog mode="new" filled />, viewport);
    await expect.element(dialog.getByPlaceholder('Name your collection')).toHaveValue('Field notes');
    await expect
      .element(dialog.getByPlaceholder('What will people find here?'))
      .toHaveValue('Posts worth keeping from the people I follow.');
    await matchVrtFrameScreenshot(`dialog-collection-new-filled-${name}`);
  });

  it.each(VIEWPORTS)('renders a filled edit collection form at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <CollectionFormDialog mode="edit" filled withCover />,
      viewport,
      COLLECTION_IMAGES,
    );
    await expect.element(dialog.getByRole('heading', { name: 'Edit Collection' })).toBeVisible();
    await expect.element(dialog.getByRole('button', { name: 'Remove image' })).toBeVisible();
    await expect.element(dialog.getByRole('button', { name: 'Save changes' })).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-collection-edit-${name}`);
  });
});

describe('Profile dialogs — visual regression', () => {
  it.each(VIEWPORTS)('renders an empty add-link dialog at %s viewport', async (name, viewport) => {
    await preloadImages(CHROME_IMAGES);
    await renderForVRT(
      <VrtDialogChrome>
        <DialogAddLink onSave={() => undefined} />
      </VrtDialogChrome>,
      { viewport },
    );
    await page.getByRole('button', { name: 'Add link' }).click();
    const dialog = page.getByTestId('dialog-content');
    await expect.element(dialog.getByTestId('dialog-title')).toHaveTextContent('Add link');
    await expect.element(dialog.getByPlaceholder('Twitter', { exact: true })).toHaveValue('');
    await matchVrtFrameScreenshot(`dialog-add-link-empty-${name}`);
  });

  it.each(VIEWPORTS)('renders a filled add-link dialog at %s viewport', async (name, viewport) => {
    await preloadImages(CHROME_IMAGES);
    await renderForVRT(
      <VrtDialogChrome>
        <DialogAddLink onSave={() => undefined} />
      </VrtDialogChrome>,
      { viewport },
    );
    await page.getByRole('button', { name: 'Add link' }).click();
    const dialog = page.getByTestId('dialog-content');
    await dialog.getByPlaceholder('Twitter', { exact: true }).fill('Site');
    await dialog.getByPlaceholder('https://twitter.com/satoshi', { exact: true }).fill(LINK_URL);
    await expect.element(dialog.getByPlaceholder('Twitter', { exact: true })).toHaveValue('Site');
    await expect.element(dialog.getByPlaceholder('https://twitter.com/satoshi', { exact: true })).toHaveValue(LINK_URL);
    await matchVrtFrameScreenshot(`dialog-add-link-filled-${name}`);
  });

  it.each(VIEWPORTS)('renders delete account at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(<DialogDeleteAccount isOpen onOpenChangeAction={() => undefined} />, viewport);
    await expect.element(dialog.getByTestId('dialog-title')).toHaveTextContent('Delete Account');
    await matchVrtFrameScreenshot(`dialog-delete-account-${name}`);
  });

  it.each(VIEWPORTS)('renders the external-link check at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <DialogCheckLink open onOpenChangeAction={() => undefined} linkUrl={LINK_URL} />,
      viewport,
    );
    await expect.element(dialog.getByTestId('dialog-title')).toHaveTextContent('Double-check this link');
    await expect.element(dialog.getByText(LINK_URL)).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-check-link-${name}`);
  });
});
