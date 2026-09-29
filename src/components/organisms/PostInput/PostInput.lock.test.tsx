import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TLockConfig } from '@/application/locks/locks.types';
import { LOCK_ATTACHMENT_MAX_FILES, LOCK_ATTACHMENT_MAX_SIZE, LOCK_TEASER_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { PostInput } from './PostInput';
import { POST_INPUT_VARIANT } from './PostInput.constants';

/**
 * Wiring tests for the composer's lock flow — the decisions PostInput itself makes around the lock
 * hooks. Everything below the controller/store boundary is mocked; heavy child components are
 * replaced with slim probes that surface the props PostInput passes them.
 */

const mocks = vi.hoisted(() => ({
  createLockContent: vi.fn(),
  commitCreate: vi.fn(),
  clearSession: vi.fn(),
  handleSubmit: vi.fn(), // the normal (non-lock) publish path
  toast: vi.fn(),
  // Null by default, which keeps PostHeader (db-backed) out of the render.
  currentUserPubky: null as string | null,
  uploadingCount: 0,
  serializeArticleForLock: vi.fn(),
  // What the title and body inputs hold while the composer state still trails them. Null once it caught up.
  latestArticle: null as { title: string; body: string } | null,
  // Last options PostInput handed to usePostInput.
  postInputOptions: {} as { keepInlineImages?: boolean },
  // Test handle into the fake composer state, refreshed on every render.
  composer: {} as {
    content: string;
    setContent: (value: string) => void;
    tags: string[];
    attachments: File[];
    setAttachments: (files: File[]) => void;
    lockTitle: string;
    setLockTitle: (value: string) => void;
    setIsArticle: (value: boolean) => void;
    articleTitle: string;
    setArticleTitle: (value: string) => void;
  },
}));

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { createLockContent: mocks.createLockContent, clearSession: mocks.clearSession },
}));
vi.mock('@/controllers/post/post', () => ({
  PostController: { commitCreate: mocks.commitCreate },
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: 'alice' }),
}));
// The auth store stub above carries no session; the lock switch gates on this hook (#2373).
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
vi.mock('@/hooks/useLockFile/useLockFile', () => ({
  useLockFile: (lockUrl?: string) => ({
    lockFile: null,
    priceSats: lockUrl ? '4321' : null,
    hasError: false,
  }),
}));

// Fake composer: real state for the fields the lock flow captures/clears, no-ops for the rest.
vi.mock('@/hooks/usePostInput/usePostInput', async () => {
  const { useRef, useState } = await import('react');
  return {
    // Everything starts empty on purpose: edit-mode values must arrive through PostInput's own
    // seeding effects, so deleting one of those effects fails a test instead of passing silently.
    usePostInput: (options: { keepInlineImages?: boolean }) => {
      mocks.postInputOptions = options;
      const [content, setContent] = useState('');
      const [tags, setTags] = useState<string[]>([]);
      const [attachments, setAttachments] = useState<File[]>([]);
      const [isArticle, setIsArticle] = useState(false);
      const [articleTitle, setArticleTitle] = useState('');
      const [lockTitle, setLockTitle] = useState('');
      mocks.composer = {
        content,
        setContent,
        tags,
        attachments,
        setAttachments,
        lockTitle,
        setLockTitle,
        setIsArticle,
        articleTitle,
        setArticleTitle,
      };
      return {
        textareaRef: useRef(null),
        markdownEditorRef: useRef(null),
        containerRef: useRef(null),
        fileInputRef: useRef(null),
        content,
        setContent,
        tags,
        setTags,
        attachments,
        setAttachments,
        existingAttachments: [],
        removeExistingAttachment: vi.fn(),
        uploadingCount: mocks.uploadingCount,
        serializeArticleForLock: mocks.serializeArticleForLock,
        getLatestArticle: () => mocks.latestArticle ?? { title: articleTitle, body: content },
        isArticle,
        setIsArticle,
        handleArticleClick: vi.fn(),
        articleTitle,
        setArticleTitle,
        lockTitle,
        setLockTitle,
        handleArticleTitleChange: vi.fn(),
        handleArticleBodyChange: vi.fn(),
        isDragging: false,
        isExpanded: true,
        isSubmitting: false,
        showEmojiPicker: false,
        setShowEmojiPicker: vi.fn(),
        displayPlaceholder: 'placeholder',
        currentUserPubky: mocks.currentUserPubky,
        handleExpand: vi.fn(),
        handleSubmit: mocks.handleSubmit,
        handleChange: (event: { target: { value: string } }) => setContent(event.target.value),
        handleEmojiSelect: vi.fn(),
        handleFilesAdded: vi.fn(),
        handleFileClick: vi.fn(),
        handleDragEnter: vi.fn(),
        handleDragLeave: vi.fn(),
        handleDragOver: vi.fn(),
        handleDrop: vi.fn(),
        handlePaste: vi.fn(),
        mentionUsers: [],
        mentionIsOpen: false,
        mentionSelectedIndex: 0,
        setMentionSelectedIndex: vi.fn(),
        handleMentionSelect: vi.fn(),
        handleMentionKeyDown: vi.fn(),
      };
    },
  };
});

// Auth wrappers: pass straight through, always authenticated.
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

// Probes: slim stand-ins exposing the wiring under test.
vi.mock('../PostInputExpandableSection/PostInputExpandableSection', () => ({
  PostInputExpandableSection: (props: {
    lockSwitch?: { checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean };
    lockCard?: React.ReactNode;
    onSubmit: () => void;
    isPostDisabled: boolean;
    isSubmitting: boolean;
  }) => (
    <div>
      {props.lockSwitch && (
        <button
          data-testid="lock-switch"
          data-checked={props.lockSwitch.checked}
          disabled={props.lockSwitch.disabled}
          onClick={() => props.lockSwitch?.onCheckedChange(!props.lockSwitch.checked)}
        />
      )}
      {props.lockCard && <div data-testid="lock-card">{props.lockCard}</div>}
      <button
        data-testid="post-button"
        disabled={props.isPostDisabled || props.isSubmitting}
        onClick={props.onSubmit}
      />
    </div>
  ),
}));
vi.mock('@/molecules/DialogLockContent/DialogLockContent', () => ({
  DialogLockContent: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onApplied: (config: TLockConfig) => void;
  }) =>
    props.open ? (
      <div data-testid="lock-dialog">
        <button data-testid="apply-lock" onClick={() => props.onApplied({ amountSats: '1234' })} />
        <button data-testid="cancel-lock" onClick={() => props.onOpenChange(false)} />
      </div>
    ) : null,
}));
vi.mock('@/organisms/DialogLocksAuth/DialogLocksAuth', () => ({
  DialogLocksAuth: (props: { open: boolean; onSuccess: (session: unknown) => void }) =>
    props.open ? <div data-testid="auth-dialog" /> : null,
}));
vi.mock('@/molecules/LockedPostCard/LockedPostCard', () => ({
  LockedPostCard: ({
    title,
    priceSats,
    editableTitle,
  }: {
    title?: string;
    priceSats?: string | null;
    editableTitle?: { value: string; onChange: (value: string) => void };
  }) =>
    editableTitle ? (
      <>
        <input
          aria-label="Lock title"
          value={editableTitle.value}
          onChange={(event) => editableTitle.onChange(event.target.value)}
        />
        <span data-testid="lock-card-price">{priceSats ?? ''}</span>
      </>
    ) : (
      <div data-testid="locked-post-card">{title}</div>
    ),
}));
vi.mock('@/molecules/MentionPopover/MentionPopover', () => ({ MentionPopover: () => null }));
vi.mock('@/molecules/PostInputAttachments/PostInputAttachments', () => ({ PostInputAttachments: () => null }));
vi.mock('@/molecules/PostPreviewCard/PostPreviewCard', () => ({ PostPreviewCard: () => null }));
vi.mock('@/molecules/MarkdownEditor/MarkdownEditor', () => ({ MarkdownEditor: () => null }));
vi.mock('@/molecules/MarkdownEditor/InitializedMDXEditor.utils', () => ({
  sanitizeCodeBlockLanguages: (value: string) => value,
}));
vi.mock('../PostHeader/PostHeader', () => ({ PostHeader: () => null }));

const renderComposer = () => {
  const onSuccess = vi.fn();
  render(<PostInput variant={POST_INPUT_VARIANT.POST} onSuccess={onSuccess} />);
  return { onSuccess };
};

const renderEditLock = () =>
  render(
    <PostInput
      variant={POST_INPUT_VARIANT.EDIT}
      editPostId="alice:POST1"
      editContent="Public teaser"
      editIsArticle={false}
      editAttachments={[]}
      editLock={{ lockUrl: 'pubky://alice/pub/app.locks/LOCK1.json', title: 'Private note' }}
      expanded
    />,
  );

/** Seed a body, switch the lock on (session already live), and apply the price. */
const configureLock = async (body = 'secret body') => {
  act(() => mocks.composer.setContent(body));
  fireEvent.click(screen.getByTestId('lock-switch'));
  fireEvent.click(screen.getByTestId('apply-lock'));
  // The composer now holds the announcement teaser.
  act(() => mocks.composer.setContent('my teaser'));
};

describe('PostInput lock wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserPubky = null;
    mocks.uploadingCount = 0;
    mocks.latestArticle = null;
    mocks.serializeArticleForLock.mockReset();
    mocks.createLockContent.mockResolvedValue({
      lock_id: 'L1',
      content_lock_path: '/pub/app.locks/L1.json',
      creator: 'pubkybob',
    });
    mocks.commitCreate.mockResolvedValue('alice:POST1');
  });

  describe('lock limits', () => {
    // 10,000,000 bytes is 9.54 MiB: the label rounds down, like the app's other MiB labels.
    const LIMITS = `Locked content supports up to ${LOCK_ATTACHMENT_MAX_FILES} files of 9.5MB each.`;

    const fileOfSize = (size: number, name = 'pic.png') => {
      const file = new File(['x'], name, { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: size });
      return file;
    };
    const files = (count: number) => Array.from({ length: count }, (_, index) => fileOfSize(1, `pic-${index}.png`));

    const renderPostWith = (attachments: File[]) => {
      renderComposer();
      act(() => {
        mocks.composer.setContent('post body');
        mocks.composer.setAttachments(attachments);
      });
    };

    const expectRefused = () => {
      expect(mocks.toast).toHaveBeenCalledWith({ variant: 'error', description: LIMITS });
      expect(screen.getByTestId('lock-switch')).toHaveAttribute('data-checked', 'false');
      expect(screen.queryByTestId('lock-dialog')).not.toBeInTheDocument();
    };

    it('says nothing while the creator has not asked for a lock', () => {
      renderPostWith([fileOfSize(LOCK_ATTACHMENT_MAX_SIZE + 1)]);

      expect(screen.getByTestId('lock-switch')).toBeEnabled();
      expect(mocks.toast).not.toHaveBeenCalled();
      expect(screen.queryByText(LIMITS)).not.toBeInTheDocument();
    });

    it('refuses the switch, with the limits, for a file too large for a lock', () => {
      renderPostWith([fileOfSize(LOCK_ATTACHMENT_MAX_SIZE + 1)]);

      fireEvent.click(screen.getByTestId('lock-switch'));

      expectRefused();
      expect(mocks.composer.attachments).toHaveLength(1); // nothing was taken out of the composer
    });

    it('refuses the switch for one file more than a lock takes', () => {
      renderPostWith(files(LOCK_ATTACHMENT_MAX_FILES + 1));

      fireEvent.click(screen.getByTestId('lock-switch'));

      expectRefused();
    });

    it('accepts files that fill both limits exactly', () => {
      renderPostWith([fileOfSize(LOCK_ATTACHMENT_MAX_SIZE), ...files(LOCK_ATTACHMENT_MAX_FILES - 1)]);

      fireEvent.click(screen.getByTestId('lock-switch'));

      expect(mocks.toast).not.toHaveBeenCalled();
      expect(screen.getByTestId('lock-switch')).toHaveAttribute('data-checked', 'true');
    });

    it('counts the body images of an article together with its cover', () => {
      mocks.serializeArticleForLock.mockReturnValue({
        body: 'serialized',
        inlineFiles: files(LOCK_ATTACHMENT_MAX_FILES),
      });
      renderComposer();
      act(() => {
        mocks.composer.setIsArticle(true);
        mocks.composer.setArticleTitle('Essay');
        mocks.composer.setContent('article body');
        mocks.composer.setAttachments(files(1));
      });

      fireEvent.click(screen.getByTestId('lock-switch'));

      expectRefused();
    });

    it('leaves the announcement alone: its attachments are public, not locked', async () => {
      renderComposer();
      await configureLock();

      act(() => mocks.composer.setAttachments([fileOfSize(LOCK_ATTACHMENT_MAX_SIZE + 1)]));

      expect(mocks.toast).not.toHaveBeenCalled();
      expect(screen.getByTestId('post-button')).toBeEnabled();
    });
  });

  // TODO:[Locks] #2683 — this whole describe covers the temporary SVG guard; delete it with the guard.
  describe('SVG files', () => {
    const NO_SVG = 'Locked content cannot include SVG images yet.';
    const svg = new File(['<svg />'], 'drawing.svg', { type: 'image/svg+xml' });
    const png = new File(['x'], 'pic.png', { type: 'image/png' });

    const expectRefused = () => {
      expect(mocks.toast).toHaveBeenCalledWith({ variant: 'error', description: NO_SVG });
      expect(screen.getByTestId('lock-switch')).toHaveAttribute('data-checked', 'false');
      expect(screen.queryByTestId('lock-dialog')).not.toBeInTheDocument();
    };

    it('refuses the switch for a post that attaches an SVG', () => {
      renderComposer();
      act(() => {
        mocks.composer.setContent('post body');
        mocks.composer.setAttachments([png, svg]);
      });

      fireEvent.click(screen.getByTestId('lock-switch'));

      expectRefused();
    });

    it('refuses the switch for an article with an SVG in its body', () => {
      mocks.serializeArticleForLock.mockReturnValue({ body: 'serialized', inlineFiles: [svg] });
      renderComposer();
      act(() => {
        mocks.composer.setIsArticle(true);
        mocks.composer.setArticleTitle('Essay');
        mocks.composer.setContent('article body');
      });

      fireEvent.click(screen.getByTestId('lock-switch'));

      expectRefused();
    });

    it('says nothing about an SVG while the creator has not asked for a lock', () => {
      renderComposer();
      act(() => {
        mocks.composer.setContent('post body');
        mocks.composer.setAttachments([svg]);
      });

      expect(screen.getByTestId('lock-switch')).toBeEnabled();
      expect(mocks.toast).not.toHaveBeenCalled();
    });

    it('leaves the announcement alone: its SVG is a public attachment, which renders', async () => {
      renderComposer();
      await configureLock();

      act(() => mocks.composer.setAttachments([svg]));

      expect(mocks.toast).not.toHaveBeenCalled();
      expect(screen.getByTestId('post-button')).toBeEnabled();
    });
  });

  describe('locking an article with body images', () => {
    const EDITOR_FORM = 'intro ![shot](pubky://author/pub/pubky.app/files/FILE1)';
    const cover = new File(['c'], 'cover.png', { type: 'image/png' });
    const inline = new File(['i'], 'shot.jpg', { type: 'image/jpeg' });

    const renderArticle = (title = 'Essay') => {
      renderComposer();
      act(() => {
        mocks.composer.setIsArticle(true);
        mocks.composer.setArticleTitle(title);
        mocks.composer.setContent(EDITOR_FORM);
        mocks.composer.setAttachments([cover]);
      });
    };

    beforeEach(() => {
      mocks.serializeArticleForLock.mockReturnValue({ body: 'intro ![shot](attachment:1)', inlineFiles: [inline] });
    });

    it('uploads the body images into the lock, after the cover', async () => {
      renderArticle();
      fireEvent.click(screen.getByTestId('lock-switch'));
      fireEvent.click(screen.getByTestId('apply-lock'));
      act(() => mocks.composer.setContent('my teaser'));

      fireEvent.click(screen.getByTestId('post-button'));

      await waitFor(() => expect(mocks.createLockContent).toHaveBeenCalledTimes(1));
      const { attachments } = mocks.createLockContent.mock.calls[0][0] as { attachments: { contentType: string }[] };
      expect(attachments.map((attachment) => attachment.contentType)).toEqual(['image/png', 'image/jpeg']);
    });

    it('captures what the inputs hold, which the composer state has not caught up with', () => {
      // Whatever the editor mode: rich text and markdown both report through the same handler.
      mocks.latestArticle = { title: 'Essay, retitled', body: `${EDITOR_FORM} and a late image` };
      renderArticle();
      fireEvent.click(screen.getByTestId('lock-switch'));
      expect(mocks.serializeArticleForLock).toHaveBeenCalledWith(`${EDITOR_FORM} and a late image`);

      mocks.latestArticle = null;
      fireEvent.click(screen.getByTestId('apply-lock'));
      fireEvent.click(screen.getByTestId('lock-switch')); // off: the capture goes back into the composer

      expect(mocks.composer.content).toBe(`${EDITOR_FORM} and a late image`);
      expect(mocks.composer.articleTitle).toBe('Essay, retitled');
    });

    it('puts the editor form of the body back when the lock is abandoned', () => {
      renderArticle();
      fireEvent.click(screen.getByTestId('lock-switch'));
      fireEvent.click(screen.getByTestId('apply-lock'));

      fireEvent.click(screen.getByTestId('lock-switch')); // off

      expect(mocks.composer.content).toBe(EDITOR_FORM);
      expect(mocks.composer.attachments).toEqual([cover]);
    });

    it('leaves the switch off when the body cannot be published', () => {
      mocks.serializeArticleForLock.mockReturnValue(null);
      renderArticle();

      fireEvent.click(screen.getByTestId('lock-switch'));

      expect(screen.getByTestId('lock-switch')).toHaveAttribute('data-checked', 'false');
      expect(screen.queryByTestId('lock-dialog')).not.toBeInTheDocument();
      expect(mocks.composer.content).toBe(EDITOR_FORM);
    });

    it('keeps the switch disabled until the article has a title, as publishing one does', () => {
      renderArticle('  ');

      expect(screen.getByTestId('lock-switch')).toBeDisabled();

      act(() => mocks.composer.setArticleTitle('Essay'));

      expect(screen.getByTestId('lock-switch')).toBeEnabled();
    });

    it('keeps the switch disabled for an article with a cover and a title but no body', () => {
      renderComposer();
      act(() => {
        mocks.composer.setIsArticle(true);
        mocks.composer.setArticleTitle('Essay');
        mocks.composer.setAttachments([cover]);
      });

      expect(screen.getByTestId('lock-switch')).toBeDisabled();
    });

    it.each([
      ['a title', { title: '', body: EDITOR_FORM }],
      ['a body', { title: 'Essay', body: '  ' }],
    ])('refuses, with a toast, %s cleared after the last state update', (_label, latest) => {
      mocks.latestArticle = latest;
      renderArticle();

      fireEvent.click(screen.getByTestId('lock-switch'));

      expect(mocks.toast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Add a title and a body to lock this article.',
      });
      expect(screen.getByTestId('lock-switch')).toHaveAttribute('data-checked', 'false');
      expect(mocks.serializeArticleForLock).not.toHaveBeenCalled();
    });

    it('keeps the switch disabled while a body image is still uploading', () => {
      mocks.uploadingCount = 1;

      renderArticle();

      expect(screen.getByTestId('lock-switch')).toBeDisabled();
    });

    it('does not serialize a normal post', () => {
      renderComposer();
      act(() => mocks.composer.setContent(EDITOR_FORM));

      fireEvent.click(screen.getByTestId('lock-switch'));

      expect(mocks.serializeArticleForLock).not.toHaveBeenCalled();
      expect(screen.getByTestId('lock-switch')).toHaveAttribute('data-checked', 'true');
    });

    it('keeps the uploaded images for as long as the captured article is held', async () => {
      renderArticle();
      expect(mocks.postInputOptions.keepInlineImages).toBe(false);

      fireEvent.click(screen.getByTestId('lock-switch'));
      fireEvent.click(screen.getByTestId('apply-lock'));
      // The composer left article mode here; without the hold the uploads would be deleted now.
      expect(mocks.postInputOptions.keepInlineImages).toBe(true);

      act(() => mocks.composer.setContent('my teaser'));
      fireEvent.click(screen.getByTestId('post-button'));

      await waitFor(() => expect(mocks.postInputOptions.keepInlineImages).toBe(false));
    });

    it('lets go of the uploaded images when the lock is abandoned', () => {
      renderArticle();
      fireEvent.click(screen.getByTestId('lock-switch'));
      fireEvent.click(screen.getByTestId('apply-lock'));

      fireEvent.click(screen.getByTestId('lock-switch')); // off

      expect(mocks.postInputOptions.keepInlineImages).toBe(false);
    });

    it('holds nothing for a locked normal post', async () => {
      renderComposer();
      await configureLock();

      expect(mocks.postInputOptions.keepInlineImages).toBe(false);
    });
  });

  it('shows the price on the composer card after a paid lock is applied', () => {
    renderComposer();
    act(() => mocks.composer.setContent('secret body'));
    fireEvent.click(screen.getByTestId('lock-switch'));
    fireEvent.click(screen.getByTestId('apply-lock'));

    expect(screen.getByTestId('lock-card-price')).toHaveTextContent('1234');
  });

  it('shows an editable lock teaser, title, and read-only price in edit mode', () => {
    renderEditLock();

    expect(screen.getByRole('textbox', { name: 'Lock title' })).toHaveValue('Private note');
    expect(screen.getByPlaceholderText('Write a short announcement to tease your content.')).toHaveValue(
      'Public teaser',
    );
    expect(screen.getByTestId('lock-card-price')).toHaveTextContent('4321');
    expect(screen.queryByTestId('lock-switch')).not.toBeInTheDocument();
  });

  // Both fields come from the same stored row, so a live change to either one reseeds both. Reverting
  // only one would let the next save write the new title over the old body.
  it('reseeds the teaser and the title together when the stored row changes', () => {
    const view = renderEditLock();

    fireEvent.change(screen.getByPlaceholderText('Write a short announcement to tease your content.'), {
      target: { value: 'Draft teaser' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Lock title' }), { target: { value: 'Draft title' } });

    view.rerender(
      <PostInput
        variant={POST_INPUT_VARIANT.EDIT}
        editPostId="alice:POST1"
        editContent="Public teaser"
        editIsArticle={false}
        editAttachments={[]}
        editLock={{ lockUrl: 'pubky://alice/pub/app.locks/LOCK1.json', title: 'Remote title' }}
        expanded
      />,
    );

    expect(screen.getByPlaceholderText('Write a short announcement to tease your content.')).toHaveValue(
      'Public teaser',
    );
    expect(screen.getByRole('textbox', { name: 'Lock title' })).toHaveValue('Remote title');
  });

  // A failed save writes the draft locally first and rolls it back after the homeserver rejects it.
  // Both versions reach the composer through the live row, so the title has to follow the teaser.
  it('reverts the title with the teaser when a failed save rolls the row back', () => {
    const view = renderEditLock();
    const teaserInput = screen.getByPlaceholderText('Write a short announcement to tease your content.');
    const titleInput = screen.getByRole('textbox', { name: 'Lock title' });

    fireEvent.change(teaserInput, { target: { value: 'Draft teaser' } });
    fireEvent.change(titleInput, { target: { value: 'Draft title' } });

    const rerenderRow = (content: string, title: string) =>
      view.rerender(
        <PostInput
          variant={POST_INPUT_VARIANT.EDIT}
          editPostId="alice:POST1"
          editContent={content}
          editIsArticle={false}
          editAttachments={[]}
          editLock={{ lockUrl: 'pubky://alice/pub/app.locks/LOCK1.json', title }}
          expanded
        />,
      );

    rerenderRow('Draft teaser', 'Draft title');
    rerenderRow('Public teaser', 'Private note');

    expect(screen.getByPlaceholderText('Write a short announcement to tease your content.')).toHaveValue(
      'Public teaser',
    );
    expect(screen.getByRole('textbox', { name: 'Lock title' })).toHaveValue('Private note');
  });

  it('disables save when the edit lock title is cleared', () => {
    renderEditLock();

    fireEvent.change(screen.getByRole('textbox', { name: 'Lock title' }), { target: { value: '   ' } });

    expect(screen.getByTestId('post-button')).toBeDisabled();
  });

  it('disables save when the serialized edit teaser exceeds the post limit', () => {
    renderEditLock();

    act(() => mocks.composer.setContent('\\'.repeat(LOCK_TEASER_MAX_CHARACTER_LENGTH)));

    expect(screen.getByTestId('post-button')).toBeDisabled();
  });

  // The single most important rule: while the switch is on, the composer body is the content to be
  // locked. Publishing before the price is applied would put that content out in the clear.
  it('publishes nothing once the lock title is cleared', async () => {
    renderComposer();
    await configureLock();

    fireEvent.change(screen.getByRole('textbox', { name: 'Lock title' }), { target: { value: '' } });
    expect(screen.getByTestId('post-button')).toBeDisabled();

    fireEvent.click(screen.getByTestId('post-button'));
    await act(async () => {});

    expect(mocks.createLockContent).not.toHaveBeenCalled();
  });

  it('publishes nothing while the lock is on but not configured', async () => {
    renderComposer();
    act(() => mocks.composer.setContent('secret body'));
    fireEvent.click(screen.getByTestId('lock-switch'));
    fireEvent.click(screen.getByTestId('cancel-lock')); // dismiss without applying…
    fireEvent.click(screen.getByTestId('lock-switch')); // …and switch straight back on
    act(() => mocks.composer.setContent('typed while unconfigured'));

    fireEvent.click(screen.getByTestId('post-button'));
    await act(async () => {});

    expect(mocks.createLockContent).not.toHaveBeenCalled();
    expect(mocks.commitCreate).not.toHaveBeenCalled();
    expect(mocks.handleSubmit).not.toHaveBeenCalled();
  });

  it('publishes the lock and its announcement from the configured composer state', async () => {
    const { onSuccess } = renderComposer();
    await configureLock();
    fireEvent.change(screen.getByRole('textbox', { name: 'Lock title' }), { target: { value: 'My title' } });

    fireEvent.click(screen.getByTestId('post-button'));

    await waitFor(() => expect(mocks.commitCreate).toHaveBeenCalledTimes(1));
    expect(mocks.createLockContent).toHaveBeenCalledTimes(1);
    expect(mocks.commitCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: 'alice',
        content: JSON.stringify({ lock_title: 'My title', teaser_description: 'my teaser' }),
        lock: 'pubky://bob/pub/app.locks/L1.json',
      }),
    );
    expect(mocks.handleSubmit).not.toHaveBeenCalled(); // never the normal path
    expect(onSuccess).toHaveBeenCalledWith('alice:POST1');
  });

  it('empties the composer after a successful lock publish', async () => {
    renderComposer();
    await configureLock();

    fireEvent.click(screen.getByTestId('post-button'));

    await waitFor(() => expect(mocks.composer.content).toBe(''));
    expect(mocks.composer.tags).toEqual([]);
    expect(screen.queryByTestId('lock-card')).not.toBeInTheDocument(); // lock state reset too
  });

  it('publishes the restored body as a normal post after the switch is turned off', async () => {
    renderComposer();
    await configureLock();
    fireEvent.click(screen.getByTestId('lock-switch')); // off — back to a normal post

    expect(mocks.composer.content).toBe('secret body'); // teaser replaced by the restored draft
    fireEvent.click(screen.getByTestId('post-button'));

    expect(mocks.handleSubmit).toHaveBeenCalledTimes(1);
    expect(mocks.createLockContent).not.toHaveBeenCalled();
    expect(mocks.commitCreate).not.toHaveBeenCalled();
  });

  it('ignores a second Post click while the lock publish is in flight', async () => {
    renderComposer();
    await configureLock();
    mocks.createLockContent.mockReturnValue(new Promise(() => {})); // never settles

    fireEvent.click(screen.getByTestId('post-button'));
    await act(async () => {});
    fireEvent.click(screen.getByTestId('post-button')); // disabled now — must be a no-op

    expect(mocks.createLockContent).toHaveBeenCalledTimes(1);
  });

  it('reopens the sign-in modal when the Lock Server rejects the session mid-publish', async () => {
    renderComposer();
    await configureLock();
    mocks.createLockContent.mockRejectedValue(
      Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Locks session rejected', {
        service: ErrorService.Locks,
        operation: 'test',
      }),
    );

    fireEvent.click(screen.getByTestId('post-button'));

    await waitFor(() => expect(screen.getByTestId('auth-dialog')).toBeInTheDocument());
    expect(mocks.commitCreate).not.toHaveBeenCalled();
    expect(mocks.composer.content).toBe('my teaser'); // nothing was cleared — the creator retries
  });

  it('shows an error toast and keeps the composer when the publish fails', async () => {
    renderComposer();
    await configureLock();
    mocks.createLockContent.mockRejectedValue(new Error('lock server down'));

    fireEvent.click(screen.getByTestId('post-button'));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' })));
    expect(mocks.composer.content).toBe('my teaser');
    expect(screen.getByTestId('lock-card')).toBeInTheDocument(); // still configured for a retry
  });
});
