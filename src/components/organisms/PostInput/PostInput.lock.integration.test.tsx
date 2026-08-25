import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOCK_TEASER_MAX_CHARACTER_LENGTH,
  LOCK_TITLE_MAX_CHARACTER_LENGTH,
  POST_MAX_CHARACTER_LENGTH,
} from '@/config/posts';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { inferPostKindForCreate } from '@/pipes/post/post.kind';
import type { TGuardedResource } from '@/services/locks/locks.types';
import { PostInput } from './PostInput';
import { POST_INPUT_VARIANT } from './PostInput.constants';

/**
 * Integration test of the composer lock flow: real action bar (switch, Post button, article button),
 * real password dialog, real locked-post card and real lock hooks, driven the way a creator would.
 * Only the IO boundary (controllers, stores, env) and db/editor-heavy leaves are mocked.
 * See `.taehwa-work/Locks/2026-locks-create-content.md` → "Post-commit: RTL integration test".
 */

const mocks = vi.hoisted(() => ({
  createLockContent: vi.fn(),
  commitCreate: vi.fn(),
  clearSession: vi.fn(),
  handleSubmit: vi.fn(), // the normal (non-lock) publish path
  toast: vi.fn(),
  post: vi.fn(), // PubkyAppPost constructor spy — records the locked post's content/kind
  hasExternalContent: undefined as (() => boolean) | undefined,
  locksAuthed: false,
  paykitConnected: false,
  lockServer: 'lockpubky' as string | undefined,
  // Test handle into the fake composer state, refreshed on every render.
  composer: {} as {
    content: string;
    setContent: (value: string) => void;
    attachments: File[];
    setAttachments: (files: File[]) => void;
    tags: string[];
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
vi.mock('@/stores/locksAuth/locksAuth.store', () => ({
  useLocksAuthStore: {
    getState: () => ({
      selectIsLocksAuthenticated: () => mocks.locksAuthed,
      selectIsPaykitConnected: () => mocks.paykitConnected,
    }),
  },
}));
vi.mock('@/config/network', () => ({
  getLockServer: () => mocks.lockServer,
  getPaykitServerUrl: () => 'https://paykit.server',
}));
vi.mock('@/molecules/Toaster/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

// Minimal specs stand-in: a kind enum (consumed by the real `inferPostKindForCreate`) and a
// constructor spy so the locked post's content/kind can be asserted.
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

// Fake composer: real state for the fields the lock flow captures/clears, no-ops for the rest.
vi.mock('@/hooks/usePostInput/usePostInput', async () => {
  const { useRef, useState } = await import('react');
  return {
    usePostInput: (options: { hasExternalContent?: () => boolean }) => {
      const [content, setContent] = useState('');
      const [tags, setTags] = useState<string[]>([]);
      const [attachments, setAttachments] = useState<File[]>([]);
      const [isArticle, setIsArticle] = useState(false);
      const [articleTitle, setArticleTitle] = useState('');
      mocks.composer = { content, setContent, attachments, setAttachments, tags };
      mocks.hasExternalContent = options.hasExternalContent;
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
        isArticle,
        setIsArticle,
        handleArticleClick: vi.fn(),
        articleTitle,
        setArticleTitle,
        handleArticleTitleChange: vi.fn(),
        handleArticleBodyChange: vi.fn(),
        isDragging: false,
        isExpanded: true,
        isSubmitting: false,
        showEmojiPicker: false,
        setShowEmojiPicker: vi.fn(),
        displayPlaceholder: 'placeholder',
        currentUserPubky: null, // keeps PostHeader (db-backed) out of the render
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

// The Lock-auth modal is an iframe + postMessage flow that cannot run in jsdom; its internals are
// covered by `useLocksAuthFlow.test.ts`. The probe drives the two outcomes the composer reacts to.
vi.mock('@/organisms/DialogLocksAuth/DialogLocksAuth', () => ({
  DialogLocksAuth: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (session: unknown) => void;
  }) =>
    props.open ? (
      <div data-testid="auth-dialog">
        <button
          data-testid="auth-success"
          onClick={() => {
            mocks.locksAuthed = true; // the real flow persists the session to the store
            mocks.paykitConnected = true; // ...and the Bitkit step records the payout account
            props.onSuccess({});
          }}
        />
        <button data-testid="auth-close" onClick={() => props.onOpenChange(false)} />
      </div>
    ) : null,
}));

// Db/editor-heavy leaves outside the lock flow.
vi.mock('@/molecules/MentionPopover/MentionPopover', () => ({ MentionPopover: () => null }));
vi.mock('@/molecules/PostInputAttachments/PostInputAttachments', () => ({ PostInputAttachments: () => null }));
vi.mock('@/molecules/PostPreviewCard/PostPreviewCard', () => ({ PostPreviewCard: () => null }));
vi.mock('@/molecules/MarkdownEditor/MarkdownEditor', () => ({ MarkdownEditor: () => null }));
vi.mock('@/molecules/MarkdownEditor/InitializedMDXEditor.utils', () => ({
  sanitizeCodeBlockLanguages: (value: string) => value,
}));
vi.mock('@/molecules/PostLinkEmbeds/PostLinkEmbeds', () => ({ PostLinkEmbeds: () => null }));
vi.mock('@/molecules/EmojiPickerDialog/EmojiPickerDialog', () => ({ EmojiPickerDialog: () => null }));
vi.mock('../PostHeader/PostHeader', () => ({ PostHeader: () => null }));

const descriptor = (path: string): TGuardedResource => ({ path, hash: 'H', content_type: 'image/png', size: 2 });

const renderComposer = () => {
  const onSuccess = vi.fn();
  render(<PostInput variant={POST_INPUT_VARIANT.POST} onSuccess={onSuccess} />);
  return { onSuccess };
};

const lockSwitch = () => screen.getByRole('switch', { name: 'Lock content' });
const postButton = () => screen.getByRole('button', { name: 'Post' });

const fillValidPassword = () => {
  fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'Secret12!' } });
  fireEvent.change(screen.getByLabelText('Repeat Password', { selector: 'input' }), {
    target: { value: 'Secret12!' },
  });
};

/** Locks fully set up: signed into the Lock Server with a connected Bitkit payout account. */
const setUpLocks = () => {
  mocks.locksAuthed = true;
  mocks.paykitConnected = true;
};

/** Seed a body, switch on (already set up), set a valid password and apply it. */
const configureLock = (body = 'secret body', files: File[] = []) => {
  setUpLocks();
  act(() => mocks.composer.setContent(body));
  if (files.length > 0) act(() => mocks.composer.setAttachments(files));
  fireEvent.click(lockSwitch());
  fillValidPassword();
  fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));
};

describe('PostInput lock flow (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.locksAuthed = false;
    mocks.paykitConnected = false;
    mocks.lockServer = 'lockpubky';
    mocks.createLockContent.mockResolvedValue({
      lock_id: 'L1',
      content_lock_path: '/pub/locks.app/L1.json',
      creator: 'pubkybob',
    });
    mocks.commitCreate.mockResolvedValue('alice:POST1');
  });

  // Full creator journey: write → switch on → sign in → password → teaser → Post.
  it.each([
    ['short text', 'my secret note', [] as File[]],
    ['a link', 'see https://pubky.app', [] as File[]],
    ['an image', 'holiday pic', [new File(['x'], 'pic.png', { type: 'image/png' })]],
  ])('locks %s and publishes the announcement', async (_name, body, files) => {
    const { onSuccess } = renderComposer();
    act(() => mocks.composer.setContent(body));
    if (files.length > 0) act(() => mocks.composer.setAttachments(files));

    fireEvent.click(lockSwitch()); // not signed in yet → auth modal first
    fireEvent.click(screen.getByTestId('auth-success'));

    fillValidPassword(); // real password dialog
    fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));

    // The card stands in for the locked content; the teaser can never become an article.
    expect(screen.getByTestId('locked-post-card')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add article' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Write a short announcement to tease your content.'), {
      target: { value: 'come see this' },
    });
    fireEvent.change(screen.getByPlaceholderText('Locked post'), { target: { value: 'My title' } });
    fireEvent.click(postButton());

    await waitFor(() => expect(mocks.commitCreate).toHaveBeenCalledTimes(1));
    expect(mocks.commitCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: 'alice',
        content: JSON.stringify({ lock_title: 'My title', teaser_description: 'come see this' }),
        lock: 'pubky://bob/pub/locks.app/L1.json',
      }),
    );

    // The locked post carries the captured body and the kind a normal post would infer.
    const [{ buildPost }] = mocks.createLockContent.mock.calls[0];
    buildPost(files.length > 0 ? [descriptor('/priv/locks.app/content/id-1')] : [], 'pubkybob');
    const expectedKind = inferPostKindForCreate({ content: body, attachments: files, isArticle: false });
    expect(mocks.post).toHaveBeenLastCalledWith(
      body,
      expectedKind,
      null,
      null,
      files.length > 0 ? ['pubky://bob/priv/locks.app/content/id-1'] : null,
    );

    expect(mocks.handleSubmit).not.toHaveBeenCalled(); // never the normal path
    expect(onSuccess).toHaveBeenCalledWith('alice:POST1');
    expect(mocks.composer.content).toBe(''); // composer emptied for the next post
  });

  describe('cancelling turns the draft back into a normal post', () => {
    it.each([
      [
        'sign-in modal is closed',
        () => {
          fireEvent.click(lockSwitch()); // unauthenticated → auth modal
          fireEvent.click(screen.getByTestId('auth-close'));
        },
      ],
      [
        'password dialog is cancelled',
        () => {
          setUpLocks();
          fireEvent.click(lockSwitch());
          fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        },
      ],
      [
        'switch is turned off after the lock was configured',
        () => {
          configureLock();
          fireEvent.click(lockSwitch());
        },
      ],
    ])('when the %s', async (_name, cancel) => {
      renderComposer();
      act(() => mocks.composer.setContent('secret body'));

      cancel();

      expect(mocks.composer.content).toBe('secret body'); // draft restored
      fireEvent.click(postButton());
      await act(async () => {});

      expect(mocks.handleSubmit).toHaveBeenCalledTimes(1); // publishes as a normal post
      expect(mocks.createLockContent).not.toHaveBeenCalled();
      expect(mocks.commitCreate).not.toHaveBeenCalled();
    });
  });

  // Mixed media on both sides: every guarded file keeps its own content type, the locked post is
  // declared as an opaque blob (the homeserver cannot detect JSON), and the announcement's public
  // attachments travel untouched as File objects into the normal upload path.
  it('locks mixed media and publishes an announcement with its own media', async () => {
    const lockedFiles = [
      new File(['i'], 'pic.png', { type: 'image/png' }),
      new File(['v'], 'clip.mp4', { type: 'video/mp4' }),
      new File(['d'], 'doc.pdf', { type: 'application/pdf' }),
      new File(['a'], 'song.mp3', { type: 'audio/mpeg' }),
    ];
    const teaserFiles = [
      new File(['tv'], 'trailer.mp4', { type: 'video/mp4' }),
      new File(['ti'], 'cover.png', { type: 'image/png' }),
    ];
    renderComposer();
    configureLock('all my media', lockedFiles);
    act(() => mocks.composer.setContent('my teaser'));
    act(() => mocks.composer.setAttachments(teaserFiles));

    fireEvent.click(postButton());
    await waitFor(() => expect(mocks.commitCreate).toHaveBeenCalledTimes(1));

    // Each guarded file went up as bytes with its own content type, in order.
    const [{ attachments, buildPost }] = mocks.createLockContent.mock.calls[0];
    expect(attachments.map((file: { contentType: string }) => file.contentType)).toEqual([
      'image/png',
      'video/mp4',
      'application/pdf',
      'audio/mpeg',
    ]);
    for (const file of attachments) expect(file.bytes).toBeInstanceOf(Uint8Array);

    // The locked post itself is declared as an opaque blob and links all four files.
    const postFile = buildPost(
      attachments.map((_: unknown, index: number) => descriptor(`/priv/locks.app/content/id-${index}`)),
      'pubkybob',
    );
    expect(postFile.contentType).toBe('application/octet-stream');
    const [, , , , uris] = mocks.post.mock.lastCall as [string, number, null, null, string[]];
    expect(uris).toHaveLength(4);

    // The announcement carries its own public media, untouched.
    expect(mocks.commitCreate).toHaveBeenCalledWith(expect.objectContaining({ attachments: teaserFiles }));
  });

  // The guarded files live on the Lock-Server-authenticated account, which may differ from the
  // pubky.app account. The owner itself comes from real upload responses (covered by the controller
  // unit tests); here we pin what the composer does with it — and that it never falls back to the
  // pubky.app account when it is missing.
  it('points guarded file links at the Lock Server account, never the pubky.app account', async () => {
    renderComposer();
    configureLock('secret body', [new File(['x'], 'pic.png', { type: 'image/png' })]);
    act(() => mocks.composer.setContent('my teaser'));
    fireEvent.click(postButton());
    await waitFor(() => expect(mocks.createLockContent).toHaveBeenCalledTimes(1));

    const [{ buildPost }] = mocks.createLockContent.mock.calls[0];
    buildPost([descriptor('/priv/locks.app/content/id-1')], 'pubkybob');
    const [, , , , uris] = mocks.post.mock.lastCall as [string, number, null, null, string[]];
    expect(uris).toEqual(['pubky://bob/priv/locks.app/content/id-1']);
    expect(JSON.stringify(uris)).not.toContain('alice');

    // No owner → refuse loudly instead of silently using the pubky.app account.
    expect(() => buildPost([descriptor('/priv/locks.app/content/id-1')])).toThrow();
  });

  it('cannot publish while the Lock Server sign-in is still pending', () => {
    renderComposer();
    act(() => mocks.composer.setContent('secret body'));

    fireEvent.click(lockSwitch()); // not signed in → sign-in modal opens, body stays in the composer

    expect(screen.getByTestId('auth-dialog')).toBeInTheDocument();
    // The locked draft is still on screen (composer not emptied until Apply Lock), so the Post button is
    // live — but publishing is gated on the lock being configured, so a click does nothing yet.
    fireEvent.click(postButton());
    expect(mocks.createLockContent).not.toHaveBeenCalled();
    expect(mocks.commitCreate).not.toHaveBeenCalled();
    expect(mocks.handleSubmit).not.toHaveBeenCalled(); // never leaks the to-be-locked body as a normal post
  });

  it('renders no lock switch when no Lock Server is configured', () => {
    mocks.lockServer = undefined;
    renderComposer();
    expect(screen.queryByRole('switch', { name: 'Lock content' })).not.toBeInTheDocument();
  });

  it('keeps Apply Lock disabled for a password that fails the policy', () => {
    renderComposer();
    setUpLocks();
    act(() => mocks.composer.setContent('secret body'));
    fireEvent.click(lockSwitch());

    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'abcd1234' } });
    fireEvent.change(screen.getByLabelText('Repeat Password', { selector: 'input' }), {
      target: { value: 'abcd1234' },
    });

    expect(screen.getByRole('button', { name: 'Apply Lock' })).toBeDisabled();
  });

  it('ignores a second Post click while the publish is in flight', async () => {
    renderComposer();
    configureLock();
    act(() => mocks.composer.setContent('my teaser'));
    mocks.createLockContent.mockReturnValue(new Promise(() => {})); // never settles

    fireEvent.click(postButton());
    // The real button now shows "Posting..." and is disabled.
    const inFlight = await screen.findByRole('button', { name: 'Posting...' });
    expect(inFlight).toBeDisabled();
    fireEvent.click(inFlight);

    expect(mocks.createLockContent).toHaveBeenCalledTimes(1);
  });

  // Specs rejects an oversized announcement, but the lock is created first — so the composer must
  // refuse the click rather than let the publish start and strand a lock nothing points at.
  describe('announcement length', () => {
    const setTeaser = (value: string) =>
      fireEvent.change(screen.getByPlaceholderText('Write a short announcement to tease your content.'), {
        target: { value },
      });
    const setTitle = (value: string) => fireEvent.change(screen.getByLabelText('Lock title'), { target: { value } });

    it('caps the title and teaser inputs at their budgets', () => {
      renderComposer();
      configureLock();

      expect(screen.getByLabelText('Lock title')).toHaveAttribute('maxLength', String(LOCK_TITLE_MAX_CHARACTER_LENGTH));
      expect(screen.getByPlaceholderText('Write a short announcement to tease your content.')).toHaveAttribute(
        'maxLength',
        String(LOCK_TEASER_MAX_CHARACTER_LENGTH),
      );
    });

    it('publishes when both fields are filled to their budgets', async () => {
      renderComposer();
      configureLock();
      setTeaser('b'.repeat(LOCK_TEASER_MAX_CHARACTER_LENGTH));
      setTitle('a'.repeat(LOCK_TITLE_MAX_CHARACTER_LENGTH));

      fireEvent.click(postButton());

      await waitFor(() => expect(mocks.commitCreate).toHaveBeenCalledTimes(1));
      const [{ content }] = mocks.commitCreate.mock.calls[0];
      expect(content.length).toBe(POST_MAX_CHARACTER_LENGTH);
    });

    it('disables Post and creates no lock when escaping pushes the envelope over', async () => {
      renderComposer();
      configureLock();
      setTeaser('"'.repeat(LOCK_TEASER_MAX_CHARACTER_LENGTH)); // fits the input, doubles when escaped

      expect(postButton()).toBeDisabled();

      fireEvent.click(postButton());

      await waitFor(() => expect(mocks.createLockContent).not.toHaveBeenCalled());
      expect(mocks.commitCreate).not.toHaveBeenCalled();
    });

    it('re-enables Post once the teaser is trimmed back under the limit', () => {
      renderComposer();
      configureLock();
      setTeaser('"'.repeat(LOCK_TEASER_MAX_CHARACTER_LENGTH));
      expect(postButton()).toBeDisabled();

      setTeaser('a readable teaser');

      expect(postButton()).toBeEnabled();
    });
  });

  // An empty composer is not always idle — the lock flow holds the draft outside it.
  // Only the signal is checked here: `usePostInput` is faked, so no collapse runs. The composer
  // really staying open on an outside click belongs in an e2e test.
  it('reports work in progress to the collapse guard while the lock is on', () => {
    renderComposer();
    expect(mocks.hasExternalContent?.()).toBe(false);

    configureLock();

    expect(mocks.composer.content).toBe(''); // the body moved into the lock draft
    expect(mocks.hasExternalContent?.()).toBe(true);

    fireEvent.click(lockSwitch()); // back to a normal post

    expect(mocks.hasExternalContent?.()).toBe(false);
  });

  it('reopens sign-in and keeps the draft when the Lock Server rejects the session', async () => {
    renderComposer();
    configureLock();
    act(() => mocks.composer.setContent('my teaser'));
    mocks.createLockContent.mockRejectedValue(
      Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Locks session rejected', {
        service: ErrorService.Locks,
        operation: 'test',
      }),
    );

    fireEvent.click(postButton());

    await waitFor(() => expect(screen.getByTestId('auth-dialog')).toBeInTheDocument());
    expect(mocks.commitCreate).not.toHaveBeenCalled();
    expect(mocks.composer.content).toBe('my teaser'); // nothing lost — the creator retries
  });
});
