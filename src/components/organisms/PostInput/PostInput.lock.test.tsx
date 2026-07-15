import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  // Test handle into the fake composer state, refreshed on every render.
  composer: {} as {
    content: string;
    setContent: (value: string) => void;
    tags: string[];
    attachments: File[];
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
  useLocksAuthStore: { getState: () => ({ selectIsLocksAuthenticated: () => true }) },
}));
vi.mock('@/config/network', () => ({ getLockServer: () => 'lockpubky' }));
vi.mock('@/molecules/Toaster/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

// Fake composer: real state for the fields the lock flow captures/clears, no-ops for the rest.
vi.mock('@/hooks/usePostInput/usePostInput', async () => {
  const { useRef, useState } = await import('react');
  return {
    usePostInput: () => {
      const [content, setContent] = useState('');
      const [tags, setTags] = useState<string[]>([]);
      const [attachments, setAttachments] = useState<File[]>([]);
      const [isArticle, setIsArticle] = useState(false);
      const [articleTitle, setArticleTitle] = useState('');
      mocks.composer = { content, setContent, tags, attachments };
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
    lockSwitch?: { checked: boolean; onCheckedChange: (checked: boolean) => void };
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
    onApplied: (password: string) => void;
  }) =>
    props.open ? (
      <div data-testid="lock-dialog">
        <button data-testid="apply-lock" onClick={() => props.onApplied('Secret12!')} />
        <button data-testid="cancel-lock" onClick={() => props.onOpenChange(false)} />
      </div>
    ) : null,
}));
vi.mock('@/organisms/DialogLocksAuth/DialogLocksAuth', () => ({
  DialogLocksAuth: (props: { open: boolean; onSuccess: (session: unknown) => void }) =>
    props.open ? <div data-testid="auth-dialog" /> : null,
}));
vi.mock('@/molecules/LockedPostCard/LockedPostCard', () => ({
  LockedPostCard: ({ title }: { title: string }) => <div data-testid="locked-post-card">{title}</div>,
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

/** Seed a body, switch the lock on (session already live), and apply the unlock method. */
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
    mocks.createLockContent.mockResolvedValue({
      lock_id: 'L1',
      content_lock_path: '/pub/locks.app/L1.json',
      creator: 'pubkybob',
    });
    mocks.commitCreate.mockResolvedValue('alice:POST1');
  });

  // The single most important rule: while the switch is on, the composer body is the content to be
  // locked. Publishing before the unlock method is applied would put that content out in the clear.
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
    fireEvent.change(screen.getByTestId('input'), { target: { value: 'My title' } });

    fireEvent.click(screen.getByTestId('post-button'));

    await waitFor(() => expect(mocks.commitCreate).toHaveBeenCalledTimes(1));
    expect(mocks.createLockContent).toHaveBeenCalledTimes(1);
    expect(mocks.commitCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: 'alice',
        content: JSON.stringify({ lock_title: 'My title', teaser_description: 'my teaser' }),
        lock: 'pubky://bob/pub/locks.app/L1.json',
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
