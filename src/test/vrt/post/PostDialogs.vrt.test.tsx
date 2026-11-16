// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createZustandLikeHook } from '@/test-utils/stores';
import { formatStableRelative } from '@/test-utils/vrt.clock';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { VrtDialogChrome } from '@/test-utils/vrt.dialog-chrome';
import { Dialog, DialogContent } from '@/atoms/Dialog/Dialog';
import { PostAttachmentsImagesAndVideos } from '@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos';
import { AvatarZoomModal } from '@/molecules/AvatarZoomModal/AvatarZoomModal';
import { DialogConfirmDelete } from '@/molecules/DialogConfirmDelete/DialogConfirmDelete';
import { DialogConfirmDiscard } from '@/molecules/DialogConfirmDiscard/DialogConfirmDiscard';
import { DialogFeedback } from '@/organisms/DialogFeedback/DialogFeedback';
import { DialogFeedbackSuccess } from '@/organisms/DialogFeedback/DialogFeedbackSuccess/DialogFeedbackSuccess';
import { DialogReportPost } from '@/organisms/DialogReportPost/DialogReportPost';
import { DialogReportPostSuccess } from '@/organisms/DialogReportPost/DialogReportPostSuccess/DialogReportPostSuccess';

// Delete, discard, report, feedback, the attachment lightbox, and an enlarged
// avatar. Edit-article and the short-post editor live in Article.vrt.test.tsx.
// New post, reply, and repost live in Home.vrt.test.tsx.

const VIEWPORTS = [
  ['desktop', VRT_VIEWPORT_DESKTOP],
  ['mobile', VRT_VIEWPORT_MOBILE],
] as const;

const CHROME_IMAGES = ['/pubky-logo.svg'] as const;
const LIGHTBOX_IMAGE = '/images/collections-onboarding.webp';

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

vi.mock('@/hooks/useUserDetails/useUserDetails', async () => {
  const f = await fixtures;
  const empty = { userDetails: null, isLoading: false } as const;
  return {
    useUserDetails: (pubky: string | null | undefined) => {
      if (!pubky) return empty;
      const profile = f.profiles[pubky] ?? null;
      return { userDetails: profile, isLoading: false as const };
    },
  };
});

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: () => ({ postDetails: null, isLoading: false }),
}));

vi.mock('@/hooks/useAvatarUrl/useAvatarUrl', () => ({
  useAvatarUrl: (userDetails: { image: string | null } | null | undefined) => userDetails?.image ?? null,
}));

vi.mock('@/hooks/useRelativeTime/useRelativeTime', () => ({
  useRelativeTime: () => ({ formatRelativeTime: formatStableRelative }),
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

describe('Post dialogs — confirmations — visual regression', () => {
  it.each(VIEWPORTS)('renders delete post at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <DialogConfirmDelete open onOpenChange={() => undefined} onConfirm={() => undefined} />,
      viewport,
    );
    await expect.element(dialog.getByTestId('dialog-title')).toHaveTextContent('Delete post?');
    await matchVrtFrameScreenshot(`dialog-delete-post-${name}`);
  });

  it.each(VIEWPORTS)('renders discard draft at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <DialogConfirmDiscard open onOpenChange={() => undefined} onConfirm={() => undefined} />,
      viewport,
    );
    await expect.element(dialog.getByTestId('dialog-title')).toHaveTextContent('Do you want to close it?');
    await matchVrtFrameScreenshot(`dialog-discard-draft-${name}`);
  });
});

describe('Post dialogs — report — visual regression', () => {
  it.each(VIEWPORTS)('renders the issue list at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <DialogReportPost open onOpenChange={() => undefined} postId="alice:post" />,
      viewport,
    );
    await expect.element(dialog.getByRole('heading', { name: 'Report Post' })).toBeVisible();
    await expect.element(dialog.getByRole('option', { name: 'Harassment or Targeted' })).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-report-issues-${name}`);
  });

  it.each(VIEWPORTS)('renders a selected issue at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <DialogReportPost open onOpenChange={() => undefined} postId="alice:post" />,
      viewport,
    );
    await dialog.getByRole('option', { name: 'Harassment or Targeted' }).click();
    await expect
      .element(dialog.getByRole('option', { name: 'Harassment or Targeted' }))
      .toHaveAttribute('aria-selected', 'true');
    await matchVrtFrameScreenshot(`dialog-report-issue-selected-${name}`);
  });

  it.each(VIEWPORTS)('renders an empty reason at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <DialogReportPost open onOpenChange={() => undefined} postId="alice:post" />,
      viewport,
    );
    await dialog.getByRole('option', { name: 'Harassment or Targeted' }).click();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect.element(dialog.getByRole('textbox', { name: 'Report reason' })).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-report-reason-empty-${name}`);
  });

  it.each(VIEWPORTS)('renders a written reason at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <DialogReportPost open onOpenChange={() => undefined} postId="alice:post" />,
      viewport,
    );
    await dialog.getByRole('option', { name: 'Harassment or Targeted' }).click();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    const reason = dialog.getByRole('textbox', { name: 'Report reason' });
    await reason.fill('This post targets someone by name.');
    await expect.element(reason).toHaveValue('This post targets someone by name.');
    await matchVrtFrameScreenshot(`dialog-report-reason-filled-${name}`);
  });

  it.each(VIEWPORTS)('renders the sent confirmation at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <Dialog open>
        <DialogContent className="w-xl" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogReportPostSuccess onOpenChange={() => undefined} />
        </DialogContent>
      </Dialog>,
      viewport,
    );
    await expect.element(dialog.getByRole('heading', { name: 'Report Sent' })).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-report-sent-${name}`);
  });
});

describe('Post dialogs — feedback — visual regression', () => {
  it.each(VIEWPORTS)('renders an empty feedback dialog at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(<DialogFeedback open onOpenChange={() => undefined} />, viewport);
    await expect.element(dialog.getByTestId('dialog-title')).toHaveTextContent('Provide Feedback');
    await expect.element(dialog.getByPlaceholder('What do you think about Pubky? Any suggestions?')).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-feedback-empty-${name}`);
  });

  it.each(VIEWPORTS)('renders written feedback at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(<DialogFeedback open onOpenChange={() => undefined} />, viewport);
    const field = dialog.getByPlaceholder('What do you think about Pubky? Any suggestions?');
    await field.fill('The composer dialog is easier to scan on a phone.');
    await expect.element(field).toHaveValue('The composer dialog is easier to scan on a phone.');
    await matchVrtFrameScreenshot(`dialog-feedback-filled-${name}`);
  });

  it.each(VIEWPORTS)('renders the feedback received confirmation at %s viewport', async (name, viewport) => {
    const dialog = await renderDialog(
      <Dialog open>
        <DialogContent avoidKeyboard className="w-2xl" hiddenTitle="Provide Feedback">
          <DialogFeedbackSuccess onOpenChange={() => undefined} />
        </DialogContent>
      </Dialog>,
      viewport,
    );
    await expect.element(dialog.getByRole('heading', { name: 'Feedback Received' })).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-feedback-received-${name}`);
  });
});

describe('Post dialogs — media — visual regression', () => {
  it.each(VIEWPORTS)('renders the image lightbox at %s viewport', async (name, viewport) => {
    await preloadImages([...CHROME_IMAGES, LIGHTBOX_IMAGE]);
    await renderForVRT(
      <VrtDialogChrome>
        <div className="mx-auto max-w-xl p-6">
          <PostAttachmentsImagesAndVideos
            imagesAndVideos={[
              {
                type: 'image/webp',
                name: 'Collections',
                urls: { main: LIGHTBOX_IMAGE, feed: LIGHTBOX_IMAGE },
              },
            ]}
          />
        </div>
      </VrtDialogChrome>,
      { viewport },
    );
    await page.getByRole('img', { name: 'Collections' }).click();
    const dialog = page.getByTestId('dialog-content');
    await expect.element(dialog).toBeVisible();
    await expect.element(dialog.getByRole('img', { name: 'Collections' })).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-image-lightbox-${name}`);
  });

  it.each(VIEWPORTS)('renders an enlarged Facehash avatar at %s viewport', async (name, viewport) => {
    const f = await fixtures;
    await preloadImages(CHROME_IMAGES);
    await renderForVRT(
      <VrtDialogChrome>
        <AvatarZoomModal open onClose={() => undefined} name="Alice Mercado" fallbackSeed={f.viewerPubky} />
      </VrtDialogChrome>,
      { viewport },
    );
    await expect.element(page.getByRole('dialog', { name: "Alice Mercado's avatar enlarged" })).toBeVisible();
    await matchVrtFrameScreenshot(`dialog-avatar-zoom-${name}`);
  });
});
