import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TLockConfig } from '@/application/locks/locks.types';
import type { TGuardedResource } from '@/services/locks/locks.types';
import { PostInput } from './PostInput';
import { POST_INPUT_VARIANT } from './PostInput.constants';

/**
 * A locked article with body images, through the real composer hooks: `usePostInput`, `usePost`, the
 * inline image session, `usePostInputLock` and `useCreateLockContent`. Only the IO boundary
 * (controllers, stores, env) and the editor-heavy leaves are replaced, so a break in the wiring
 * between those hooks fails here.
 */

const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const IMAGE_URI = `pubky://${AUTHOR}/pub/pubky.app/files/IMAGE1`;
const BODY = `Intro\n\n![shot](${IMAGE_URI})\n\nOutro`;

const mocks = vi.hoisted(() => ({
  createLockContent: vi.fn(),
  commitCreatePost: vi.fn(),
  commitCreateFile: vi.fn(),
  commitDeleteFile: vi.fn(),
  toast: vi.fn(),
  post: vi.fn(), // PubkyAppPost constructor spy: the locked post as it is written
  // Handle into the stand-in editor, refreshed on every render. Null while no editor is mounted.
  editor: null as {
    markdown: string;
    change: (markdown: string) => void;
    upload: (file: File) => Promise<string>;
  } | null,
}));

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { createLockContent: mocks.createLockContent, clearSession: vi.fn() },
}));
vi.mock('@/controllers/post/post', () => ({
  PostController: { commitCreate: mocks.commitCreatePost, getDetails: vi.fn() },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    commitCreate: mocks.commitCreateFile,
    commitDelete: mocks.commitDeleteFile,
    getMetadata: vi.fn().mockResolvedValue([]),
    getFileUrl: vi.fn(),
  },
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' }),
}));
vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  // Null keeps PostHeader (db-backed) out of the render.
  useCurrentUserProfile: () => ({ currentUserPubky: null, userDetails: null }),
}));
vi.mock('@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade', () => ({ useSessionNeedsUpgrade: () => false }));
vi.mock('@/stores/locksAuth/locksAuth.store', () => ({
  useLocksAuthStore: {
    getState: () => ({ selectIsLocksAuthenticated: () => true, selectIsPaykitConnected: () => true }),
  },
}));
vi.mock('@/config/network', () => ({
  getLockServer: () => 'lockpubky',
  getPaykitServerUrl: () => 'https://paykit.server',
}));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: (...args: unknown[]) => mocks.toast(...args) }));
vi.mock('@/hooks/useLockFile/useLockFile', () => ({ useLockFile: () => ({ lockFile: null, priceSats: null }) }));
vi.mock('@/hooks/useMentionAutocomplete/useMentionAutocomplete', () => ({
  useMentionAutocomplete: () => ({
    users: [],
    isOpen: false,
    selectedIndex: 0,
    setSelectedIndex: vi.fn(),
    handleKeyDown: vi.fn(),
  }),
}));
vi.mock('@/hooks/useUndoRepost/useUndoRepost', () => ({ useUndoRepost: () => ({ undoRepost: vi.fn() }) }));

vi.mock('pubky-app-specs', () => ({
  PubkyAppPostKind: { Short: 0, Long: 1, Image: 2, Video: 3, Link: 4, File: 5, Collection: 6 },
  PubkyAppPost: class {
    constructor(
      public content: string,
      public kind: number,
      public parent: string | null,
      public embed: unknown,
      public attachments: string[] | null,
    ) {
      mocks.post(content, kind, parent, embed, attachments);
    }
    toJson() {
      return { content: this.content, kind: this.kind, attachments: this.attachments };
    }
  },
}));

// Auth wrappers: pass straight through, always authenticated to pubky.app.
vi.mock('@/hooks/usePostInputAuthHandlers/usePostInputAuthHandlers', () => ({
  usePostInputAuthHandlers: (params: Record<string, (...args: never[]) => unknown>) => ({
    isAuthenticated: true,
    handleExpandWithAuth: params.handleExpand,
    handleSubmitWithAuth: params.handleSubmit,
    setTagsWithAuth: params.setTags,
    setAttachmentsWithAuth: params.setAttachments,
    handleChangeWithAuth: params.handleChange,
    handleFilesAddedWithAuth: params.handleFilesAdded,
    handleFileClickWithAuth: params.handleFileClick,
    handleEmojiSelectWithAuth: params.handleEmojiSelect,
    handlePasteWithAuth: params.handlePaste,
    handleDragEventWithAuth: vi.fn(),
    createKeyDownHandler: () => vi.fn(),
    handleArticleTitleChangeWithAuth: params.handleArticleTitleChange,
    handleArticleBodyChangeWithAuth: params.handleArticleBodyChange,
    handleArticleClickWithAuth: params.handleArticleClick,
  }),
}));

// The editor cannot run in jsdom. The stand-in hands the test what the real one hands the composer:
// a change report, which rich text and markdown mode share, and the upload of an inserted image.
vi.mock('@/molecules/MarkdownEditor/MarkdownEditor', async () => {
  const { useEffect } = await import('react');
  return {
    MarkdownEditor: (props: {
      markdown: string;
      onChange: (markdown: string, initialMarkdownNormalize: boolean) => void;
      inlineImages: { upload: (file: File) => Promise<string> };
    }) => {
      mocks.editor = {
        markdown: props.markdown,
        change: (markdown) => props.onChange(markdown, false),
        upload: props.inlineImages.upload,
      };
      useEffect(
        () => () => {
          mocks.editor = null;
        },
        [],
      );
      return <div data-testid="editor">{props.markdown}</div>;
    },
  };
});
vi.mock('@/molecules/MarkdownEditor/InitializedMDXEditor.utils', () => ({
  sanitizeCodeBlockLanguages: (value: string) => value,
}));

vi.mock('../PostInputExpandableSection/PostInputExpandableSection', () => ({
  PostInputExpandableSection: (props: {
    lockSwitch?: { checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean };
    onSubmit: () => void;
    onArticleClick: () => void;
    isPostDisabled: boolean;
    isSubmitting: boolean;
  }) => (
    <div>
      <button data-testid="article-button" onClick={props.onArticleClick} />
      {props.lockSwitch && (
        <button
          data-testid="lock-switch"
          data-checked={props.lockSwitch.checked}
          disabled={props.lockSwitch.disabled}
          onClick={() => props.lockSwitch?.onCheckedChange(!props.lockSwitch.checked)}
        />
      )}
      <button
        data-testid="post-button"
        disabled={props.isPostDisabled || props.isSubmitting}
        onClick={props.onSubmit}
      />
    </div>
  ),
}));
vi.mock('@/molecules/DialogLockContent/DialogLockContent', () => ({
  DialogLockContent: (props: { open: boolean; onApplied: (config: TLockConfig) => void }) =>
    props.open ? <button data-testid="apply-lock" onClick={() => props.onApplied({ amountSats: '1234' })} /> : null,
}));
vi.mock('@/organisms/DialogLocksAuth/DialogLocksAuth', () => ({ DialogLocksAuth: () => null }));
vi.mock('@/molecules/LockedPostCard/LockedPostCard', () => ({ LockedPostCard: () => null }));
vi.mock('@/molecules/MentionPopover/MentionPopover', () => ({ MentionPopover: () => null }));
// Adds a cover the way the file picker does, through the composer's own handler.
vi.mock('@/molecules/PostInputAttachments/PostInputAttachments', () => ({
  PostInputAttachments: (props: { handleFilesAdded: (files: File[]) => void }) => (
    <button
      data-testid="add-cover"
      onClick={() => props.handleFilesAdded([new File(['cover bytes'], 'cover.png', { type: 'image/png' })])}
    />
  ),
}));
vi.mock('@/molecules/PostPreviewCard/PostPreviewCard', () => ({ PostPreviewCard: () => null }));
vi.mock('../PostHeader/PostHeader', () => ({ PostHeader: () => null }));

const image = new File(['image bytes'], 'shot.png', { type: 'image/png' });
const descriptor = (path: string): TGuardedResource => ({ path, hash: 'H', content_type: 'image/png', size: 2 });

/** Lets the title and body debounce hand their values to the composer state. */
const settle = () => act(() => vi.advanceTimersByTime(500));

/** An article with a title and one uploaded body image, as the author leaves it before locking. */
const writeArticle = async () => {
  render(<PostInput variant={POST_INPUT_VARIANT.POST} expanded />);
  fireEvent.click(screen.getByTestId('article-button'));
  fireEvent.change(screen.getByPlaceholderText('Article Title'), { target: { value: 'Essay' } });

  mocks.commitCreateFile.mockResolvedValueOnce(IMAGE_URI);
  await act(async () => {
    await mocks.editor?.upload(image);
  });
  act(() => mocks.editor?.change(BODY));
  settle();
};

const applyLock = () => {
  fireEvent.click(screen.getByTestId('lock-switch'));
  fireEvent.click(screen.getByTestId('apply-lock'));
};

const publishLock = async () => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my teaser' } });
  fireEvent.click(screen.getByTestId('post-button'));
  await waitFor(() => expect(mocks.commitCreatePost).toHaveBeenCalledTimes(1));
};

/** The locked post as `useCreateLockContent` builds it from the uploaded attachment descriptors. */
const lockedPost = () => {
  const { attachments, buildPost } = mocks.createLockContent.mock.calls[0][0] as {
    attachments: { contentType: string; bytes: Uint8Array }[];
    buildPost: (resources: TGuardedResource[], owner?: string) => unknown;
  };
  buildPost(
    attachments.map((_, index) => descriptor(`/priv/app.locks/content/file${index}`)),
    'pubkyowner',
  );
  const [content, , , , uris] = mocks.post.mock.calls.at(-1) as [string, number, null, null, string[] | null];
  return { attachments, body: (JSON.parse(content) as { body: string }).body, uris };
};

describe('PostInput - locking an article with body images (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.URL.createObjectURL = vi.fn(() => 'blob:preview');
    global.URL.revokeObjectURL = vi.fn();
    mocks.editor = null;
    mocks.commitDeleteFile.mockResolvedValue(undefined);
    mocks.commitCreatePost.mockResolvedValue(`${AUTHOR}:POST1`);
    mocks.createLockContent.mockResolvedValue({
      lock_id: 'L1',
      content_lock_path: '/pub/app.locks/L1.json',
      creator: 'pubkyowner',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('locks the image bytes and the slot that points at them, then deletes the public upload', async () => {
    await writeArticle();
    applyLock();
    // The composer left article mode to take the teaser; the public upload must outlive that.
    expect(mocks.editor).toBeNull();
    expect(mocks.commitDeleteFile).not.toHaveBeenCalled();

    await publishLock();

    const { attachments, body, uris } = lockedPost();
    expect(attachments).toHaveLength(1);
    expect(new TextDecoder().decode(attachments[0].bytes)).toBe('image bytes');
    expect(body).toBe('Intro\n\n![shot](attachment:0)\n\nOutro');
    expect(uris).toEqual(['pubky://owner/priv/app.locks/content/file0']);
    await waitFor(() => expect(mocks.commitDeleteFile).toHaveBeenCalledWith({ fileUris: [IMAGE_URI] }));
  });

  it('puts the cover first and numbers the body image after it', async () => {
    await writeArticle();
    fireEvent.click(screen.getByTestId('add-cover'));

    applyLock();
    await publishLock();

    const { attachments, body, uris } = lockedPost();
    expect(attachments.map((attachment) => new TextDecoder().decode(attachment.bytes))).toEqual([
      'cover bytes',
      'image bytes',
    ]);
    expect(body).toBe('Intro\n\n![shot](attachment:1)\n\nOutro');
    expect(uris).toEqual(['pubky://owner/priv/app.locks/content/file0', 'pubky://owner/priv/app.locks/content/file1']);
  });

  it('publishes the article normally, image included, after the lock is abandoned', async () => {
    await writeArticle();
    applyLock();

    fireEvent.click(screen.getByTestId('lock-switch')); // off: the draft goes back into the editor

    expect(mocks.editor?.markdown).toBe(BODY);
    fireEvent.click(screen.getByTestId('post-button'));
    await waitFor(() => expect(mocks.commitCreatePost).toHaveBeenCalledTimes(1));

    expect(mocks.commitCreatePost).toHaveBeenCalledWith(
      expect.objectContaining({
        content: JSON.stringify({ title: 'Essay', body: 'Intro\n\n![shot](attachment:0)\n\nOutro' }),
        attachmentUris: [IMAGE_URI],
        isArticle: true,
      }),
    );
    expect(mocks.createLockContent).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
    expect(mocks.commitDeleteFile).not.toHaveBeenCalled();
  });

  it('locks what the editor reported last, before the composer state caught up with it', async () => {
    await writeArticle();
    // Markdown mode and rich text report the same way; no debounce has passed since this change.
    act(() => mocks.editor?.change(`${BODY}\n\nA late paragraph`));

    applyLock();
    await publishLock();

    expect(lockedPost().body).toBe('Intro\n\n![shot](attachment:0)\n\nOutro\n\nA late paragraph');
  });
});
