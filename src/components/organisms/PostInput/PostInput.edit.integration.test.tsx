import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostInput } from './PostInput';
import { POST_INPUT_VARIANT } from './PostInput.constants';

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: true,
    isWaiting: false,
    requireAuth: <T,>(action: () => T) => action(),
    waitForAuth: async () => true,
  }),
}));

/**
 * Editing a post through the real composer hooks (`usePostInput`, `usePost`, the inline media
 * session) while the dialog's post row changes under it. A save that fails after its local-first
 * write reaches the dialog as two row updates (the write, then the rollback); the composer must keep
 * what the user has and send exactly that on the retry (#2877). Only the IO boundary (controllers,
 * stores, env) and the editor-heavy leaves are replaced.
 */

const mocks = vi.hoisted(() => ({
  author: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
  commitEdit: vi.fn(),
  commitCreateFile: vi.fn(),
  commitDeleteFile: vi.fn(),
  useAttachmentsMetadata: vi.fn(),
  toast: vi.fn(),
  // Handle into the stand-in editor, refreshed on every render. Null while no editor is mounted.
  editor: null as {
    markdown: string;
    change: (markdown: string) => void;
    upload: (file: File) => Promise<string>;
  } | null,
}));

const AUTHOR = mocks.author;
const POST_ID = `${AUTHOR}:POST1`;
const COVER_URI = `pubky://${AUTHOR}/pub/pubky.app/files/COVER`;
const CLIP_URI = `pubky://${AUTHOR}/pub/pubky.app/files/CLIP`;
const NEW_URI = `pubky://${AUTHOR}/pub/pubky.app/files/NEW1`;

vi.mock('@/controllers/post/post', () => ({
  PostController: { commitEdit: mocks.commitEdit, getDetails: vi.fn() },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    commitCreate: mocks.commitCreateFile,
    commitDelete: mocks.commitDeleteFile,
    getMetadata: vi.fn().mockResolvedValue([]),
    fetchFiles: vi.fn().mockResolvedValue(undefined),
    getFileUrl: vi.fn(() => 'https://cdn.example.com/file'),
  },
}));
vi.mock('@/hooks/useAttachmentsMetadata/useAttachmentsMetadata', () => ({
  useAttachmentsMetadata: (options: { fileUris: string[] }) => mocks.useAttachmentsMetadata(options),
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: mocks.author }),
}));
vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  // Null keeps PostHeader (db-backed) out of the render.
  useCurrentUserProfile: () => ({ currentUserPubky: null, userDetails: null }),
}));
vi.mock('@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade', () => ({ useSessionNeedsUpgrade: () => false }));
vi.mock('@/stores/locksAuth/locksAuth.store', () => ({
  useLocksAuthStore: {
    getState: () => ({ selectIsLocksAuthenticated: () => false, selectIsPaykitConnected: () => false }),
  },
}));
// No Locks servers: the edit composer renders without the lock switch.
vi.mock('@/config/network', () => ({
  getLockServer: () => undefined,
  getPaykitServerUrl: () => undefined,
}));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: (...args: unknown[]) => mocks.toast(...args) }));
vi.mock('@/hooks/useLockFile/useLockFile', () => ({ useLockFile: () => ({ lockFile: null, price: null }) }));
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
  fileUriBuilder: (author: string, fileId: string) => `pubky://${author}/pub/pubky.app/files/${fileId}`,
  PubkyAppPost: class {
    constructor(
      public content: string,
      public kind: number,
      public parent: string | null,
      public embed: unknown,
      public attachments: string[] | null,
    ) {}
    toJson() {
      return { content: this.content, kind: this.kind, attachments: this.attachments };
    }
  },
}));
// Auth wrappers: pass straight through, always authenticated to pubky.app.
vi.mock('@/hooks/usePostInputAuthHandlers/usePostInputAuthHandlers', () => ({
  usePostInputAuthHandlers: (params: Record<string, (...args: never[]) => unknown>) => ({
    isAuthenticated: true,
    isWaiting: false,
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
// a change report, which rich text and markdown mode share, and the staging of an inserted image (its
// bytes go up when the article is saved). Like
// the real wrapper it swaps the editor for a skeleton while the inline attachments load, so a composer
// that re-reads the row shows up as a new editor node.
vi.mock('@/molecules/MarkdownEditor/MarkdownEditor', async () => {
  const { useEffect } = await import('react');
  type EditorProps = {
    markdown: string;
    onChange: (markdown: string, initialMarkdownNormalize: boolean) => void;
    inlineMedia: { upload: (file: File) => Promise<string> };
    isLoading?: boolean;
  };
  const Editor = (props: EditorProps) => {
    mocks.editor = {
      markdown: props.markdown,
      change: (markdown) => props.onChange(markdown, false),
      upload: props.inlineMedia.upload,
    };
    useEffect(
      () => () => {
        mocks.editor = null;
      },
      [],
    );
    return <div data-testid="editor">{props.markdown}</div>;
  };
  return {
    MarkdownEditor: (props: EditorProps) =>
      props.isLoading ? <div data-testid="editor-loading" /> : <Editor {...props} />,
  };
});
vi.mock('../PostInputExpandableSection/PostInputExpandableSection', () => ({
  PostInputExpandableSection: (props: { onSubmit: () => void; isPostDisabled: boolean; isSubmitting: boolean }) => (
    <button data-testid="post-button" disabled={props.isPostDisabled || props.isSubmitting} onClick={props.onSubmit} />
  ),
}));
vi.mock('@/molecules/DialogLockContent/DialogLockContent', () => ({ DialogLockContent: () => null }));
vi.mock('@/organisms/DialogLocksAuth/DialogLocksAuth', () => ({ DialogLocksAuth: () => null }));
vi.mock('@/molecules/LockedPostCard/LockedPostCard', () => ({ LockedPostCard: () => null }));
vi.mock('@/molecules/MentionPopover/MentionPopover', () => ({ MentionPopover: () => null }));
vi.mock('@/molecules/PostInputAttachments/PostInputAttachments', () => ({ PostInputAttachments: () => null }));
vi.mock('@/molecules/PostPreviewCard/PostPreviewCard', () => ({ PostPreviewCard: () => null }));
vi.mock('../PostHeader/PostHeader', () => ({ PostHeader: () => null }));

const PUBLISHED_BODY = 'Intro\n\n![shot](attachment:1)\n\nOutro';
const PUBLISHED_ARTICLE = JSON.stringify({ title: 'Essay', body: PUBLISHED_BODY });
const EDITOR_BODY = `Intro\n\n![shot](${CLIP_URI})\n\nOutro`;
const image = new File(['image bytes'], 'shot.png', { type: 'image/png' });

const editPost = (content: string) => (
  <PostInput
    variant={POST_INPUT_VARIANT.EDIT}
    expanded
    editPostId={POST_ID}
    editContent={content}
    editIsArticle={false}
    editAttachments={[]}
  />
);
const editArticle = (content: string, attachments: string[]) => (
  <PostInput
    variant={POST_INPUT_VARIANT.EDIT}
    expanded
    editPostId={POST_ID}
    editContent={content}
    editIsArticle
    editAttachments={attachments}
  />
);
/** Lets the body debounce hand its value to the composer state. */
const settle = () => act(() => vi.advanceTimersByTime(500));
const refuseNextSave = () => mocks.commitEdit.mockRejectedValueOnce(new Error('simulated homeserver refusal'));
const save = async (calls: number) => {
  fireEvent.click(screen.getByTestId('post-button'));
  await waitFor(() => expect(mocks.commitEdit).toHaveBeenCalledTimes(calls));
};

describe('PostInput - editing while the post row changes under the dialog (integration)', () => {
  const originalCreateObjectURL = global.URL.createObjectURL;
  const originalRevokeObjectURL = global.URL.revokeObjectURL;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.URL.createObjectURL = vi.fn(() => 'blob:preview');
    global.URL.revokeObjectURL = vi.fn();
    mocks.editor = null;
    // A row read for the new file would be a fresh key, which the real hook reports as loading
    mocks.useAttachmentsMetadata.mockImplementation(({ fileUris }) => ({
      files: [],
      isLoading: fileUris.includes(NEW_URI),
    }));
    mocks.commitDeleteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    global.URL.createObjectURL = originalCreateObjectURL;
    global.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('keeps a text edit through a refused save and sends it again on the retry', async () => {
    const { rerender } = render(editPost('Published'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited' } });

    refuseNextSave();
    await save(1);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' })));
    // The failed save's local write, then its rollback, as the live post row reports them
    rerender(editPost('Edited'));
    rerender(editPost('Published'));

    expect(screen.getByRole('textbox')).toHaveValue('Edited');
    await save(2);
    expect(mocks.commitEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({ compositePostId: POST_ID, content: 'Edited' }),
    );
  });

  it('keeps an inserted article image through a refused save, without remounting the editor', async () => {
    const { rerender } = render(editArticle(PUBLISHED_ARTICLE, [COVER_URI, CLIP_URI]));
    const editorNode = screen.getByTestId('editor');
    expect(mocks.editor?.markdown).toBe(EDITOR_BODY);
    expect(mocks.useAttachmentsMetadata).toHaveBeenLastCalledWith({ fileUris: [CLIP_URI] });

    // The insert stages the file under a draft URI of the author's; nothing is uploaded yet
    let stagedUri = '';
    await act(async () => {
      stagedUri = (await mocks.editor?.upload(image)) ?? '';
    });
    expect(stagedUri).toMatch(/\/pub\/pubky\.app\/files\/draft-[0-9a-f]{7}$/);
    expect(mocks.commitCreateFile).not.toHaveBeenCalled();
    const editedBody = `${EDITOR_BODY}\n\n![new](${stagedUri})`;
    act(() => mocks.editor?.change(editedBody));
    settle();

    // The save uploads the staged file first; the refused post write leaves it in the session
    mocks.commitCreateFile.mockResolvedValueOnce(NEW_URI);
    refuseNextSave();
    await save(1);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' })));
    expect(mocks.commitCreateFile).toHaveBeenCalledTimes(1);
    // The failed save's local write carries the new slot and file, then the rollback takes them back
    const writtenArticle = JSON.stringify({ title: 'Essay', body: `${PUBLISHED_BODY}\n\n![new](attachment:2)` });
    rerender(editArticle(writtenArticle, [COVER_URI, CLIP_URI, NEW_URI]));
    rerender(editArticle(PUBLISHED_ARTICLE, [COVER_URI, CLIP_URI]));

    expect(mocks.editor?.markdown).toBe(editedBody);
    // The same editor node: the composer was never swapped for the loading skeleton and back
    expect(screen.getByTestId('editor')).toBe(editorNode);
    // The inline slots the editor waits on are the mount-time ones: the row round trip never asks for the new file
    expect(mocks.useAttachmentsMetadata).toHaveBeenLastCalledWith({ fileUris: [CLIP_URI] });
    expect(mocks.useAttachmentsMetadata).not.toHaveBeenCalledWith({ fileUris: expect.arrayContaining([NEW_URI]) });
    expect(mocks.useAttachmentsMetadata).not.toHaveBeenCalledWith({ fileUris: expect.arrayContaining([stagedUri]) });

    await save(2);
    expect(mocks.commitEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        compositePostId: POST_ID,
        content: writtenArticle,
        attachments: expect.objectContaining({ nextOrder: [COVER_URI, CLIP_URI, NEW_URI] }),
      }),
    );
    // The retry reuses the upload of the refused save instead of sending the file again
    expect(mocks.commitCreateFile).toHaveBeenCalledTimes(1);
    expect(mocks.commitDeleteFile).not.toHaveBeenCalled();
  });
});
