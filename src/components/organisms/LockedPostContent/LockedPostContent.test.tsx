import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import { useLockFile } from '@/hooks/useLockFile/useLockFile';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { LockFile, LockPostContent } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { LockedPostContent } from './LockedPostContent';

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));

vi.mock('@/hooks/useLockFile/useLockFile', () => ({ useLockFile: vi.fn() }));
vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    getLockContent: vi.fn(),
    unlock: vi.fn(),
    fetchUnlockedContent: vi.fn(),
    replicateUnlockedContent: vi.fn().mockResolvedValue(undefined),
    fetchReplicatedContent: vi.fn().mockResolvedValue(null),
    fetchOwnContent: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('@/molecules/Toaster/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: { currentUserPubky: string | null; session: object | null }) => unknown) =>
    selector({ currentUserPubky: 'pubkyreader', session: {} }),
}));
vi.mock('../PostArticle/PostArticle', () => ({
  PostArticle: ({ content }: { content: string }) => <div data-testid="post-article">{content}</div>,
}));
vi.mock('../PostBody/PostBody', () => ({
  PostBody: ({ content, localAttachments }: { content: string; localAttachments?: unknown[] }) => (
    <div data-testid="post-body" data-media={localAttachments?.length ?? 0}>
      {content}
    </div>
  ),
}));

const mockLockData = ({
  lockContent = { lock_title: 'Secret', teaser_description: 'A teaser' },
  lockFile = null,
  hasError = false,
}: {
  lockContent?: LockPostContent | null;
  lockFile?: LockFile | null;
  hasError?: boolean;
}) => {
  vi.mocked(LocksController.getLockContent).mockReturnValue(lockContent);
  vi.mocked(useLockFile).mockReturnValue({ lockFile, hasError });
};

const LOCK_URL = 'pubky://hs/pub/locks.app/lock1.json';

describe('LockedPostContent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastMock.mockClear();
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue(null);
    vi.mocked(LocksController.replicateUnlockedContent).mockResolvedValue(undefined);
  });

  it('renders the teaser body and the lock card from the parsed lock content', () => {
    mockLockData({});
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    expect(LocksController.getLockContent).toHaveBeenCalledWith('{}');
    expect(useLockFile).toHaveBeenCalledWith(LOCK_URL);
    expect(screen.getByText('A teaser')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Secret');
  });

  it('renders nothing when the teaser content is unparseable', () => {
    mockLockData({ lockContent: null });
    const { container } = render(<LockedPostContent content="not json" lock={LOCK_URL} authorId="pubkycreator" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('enables Unlock when the lock file resolved', () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();
  });

  it('disables Unlock when the lock file fetch failed', () => {
    mockLockData({ hasError: true });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });

  it('disables Unlock while the lock file is loading', () => {
    // Submitting without a lock file returns silently — the dialog would look broken.
    mockLockData({ lockFile: null, hasError: false });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });

  it('opens the unlock dialog after the button slides over the mask', async () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    expect(screen.queryByRole('heading', { name: 'Password to Unlock' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('heading', { name: 'Password to Unlock' })).toBeInTheDocument();
  });

  it('unlocks, reads the guarded post, and renders its content in place of the card', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkybob' });
    mockLockData({ lockFile });
    vi.mocked(LocksController.unlock).mockResolvedValue({ bundleId: 'b', credential: 'cred', expiresAt: 'e' });
    vi.mocked(LocksController.fetchUnlockedContent).mockResolvedValue({
      post: { content: 'the unlocked secret', kind: 'short', attachments: null },
      attachments: [],
    });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    fireEvent.change(await screen.findByLabelText('Password', { selector: 'input' }), {
      target: { value: 'anything' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'View Content' }));

    await waitFor(() => {
      expect(LocksController.unlock).toHaveBeenCalledWith({ lockFile, lockUrl: LOCK_URL, password: 'anything' });
      expect(LocksController.fetchUnlockedContent).toHaveBeenCalledWith({ lockFile, credential: 'cred' });
    });
    // Content replaces the lock card.
    expect(screen.getByText('the unlocked secret')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('sends unlocked article content to the article renderer, which keeps its title', async () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    const article = JSON.stringify({ title: 'My Essay', body: 'the body' });
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue({
      post: { content: article, kind: 'long', attachments: null },
      attachments: [],
    });

    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    expect(await screen.findByTestId('post-article')).toHaveTextContent('My Essay');
    // Only the teaser stays on PostBody — the unlocked article must not also render there.
    expect(screen.getAllByTestId('post-body')).toHaveLength(1);
    expect(screen.getByTestId('post-body')).not.toHaveTextContent(article);
  });

  it('keeps plain body text on the body renderer even when the kind is long', async () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue({
      post: { content: 'not article json', kind: 'long', attachments: null },
      attachments: [],
    });

    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    expect(await screen.findByText('not article json')).toBeInTheDocument();
    expect(screen.queryByTestId('post-article')).not.toBeInTheDocument();
  });

  it('renders the unlocked attachments as local object-URL media', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkybob' });
    mockLockData({ lockFile });
    vi.mocked(LocksController.unlock).mockResolvedValue({ bundleId: 'b', credential: 'cred', expiresAt: 'e' });
    vi.mocked(LocksController.fetchUnlockedContent).mockResolvedValue({
      post: {
        content: 'the unlocked secret',
        kind: 'image',
        attachments: ['pubky://b/priv/locks.app/content/a', 'pubky://b/priv/locks.app/content/b'],
      },
      attachments: [
        { id: 'a', contentType: 'image/png', bytes: new Uint8Array([1]) },
        { id: 'b', contentType: 'video/mp4', bytes: new Uint8Array([2]) },
      ],
    });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    fireEvent.change(await screen.findByLabelText('Password', { selector: 'input' }), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'View Content' }));

    await waitFor(() => expect(screen.getByText('the unlocked secret')).toBeInTheDocument());
    expect(screen.getByText('the unlocked secret')).toHaveAttribute('data-media', '2');
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('toasts (non-blocking) when a guarded attachment is dropped, still rendering the post', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkybob' });
    mockLockData({ lockFile });
    vi.mocked(LocksController.unlock).mockResolvedValue({ bundleId: 'b', credential: 'cred', expiresAt: 'e' });
    vi.mocked(LocksController.fetchUnlockedContent).mockResolvedValue({
      post: {
        content: 'the unlocked secret',
        kind: 'image',
        attachments: ['pubky://b/priv/locks.app/content/a', 'pubky://b/priv/locks.app/content/b'],
      },
      attachments: [{ id: 'a', contentType: 'image/png', bytes: new Uint8Array() }], // one of two dropped
    });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    fireEvent.change(await screen.findByLabelText('Password', { selector: 'input' }), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'View Content' }));

    // Post still renders (non-blocking) and the reader is warned once.
    await waitFor(() => expect(screen.getByText('the unlocked secret')).toBeInTheDocument());
    expect(toastMock).toHaveBeenCalledWith({ variant: 'error', description: 'Could not load attachments' });
  });

  it('keeps the dialog open with an error when reading the unlocked content throws', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkybob' });
    mockLockData({ lockFile });
    vi.mocked(LocksController.unlock).mockResolvedValue({ bundleId: 'b', credential: 'cred', expiresAt: 'e' });
    // Matches the real AppError thrown in production (fetchUnlockedContent throws Err.validation).
    vi.mocked(LocksController.fetchUnlockedContent).mockRejectedValue(
      Err.validation(ValidationErrorCode.INVALID_INPUT, 'unparseable guarded post', {
        service: ErrorService.Locks,
        operation: 'fetchUnlockedContent',
      }),
    );
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    fireEvent.change(await screen.findByLabelText('Password', { selector: 'input' }), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'View Content' }));

    // The dialog stays open (not silently closed on a correct password); no unlocked content renders.
    await waitFor(() => expect(LocksController.fetchUnlockedContent).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Password to Unlock' })).toBeInTheDocument();
    expect(screen.queryByText('Unlocked')).not.toBeInTheDocument();
    // Downloaded bytes are discarded with the failure — no replication, so no `post.json` marker.
    expect(LocksController.replicateUnlockedContent).not.toHaveBeenCalled();
  });

  it('shows already-unlocked content on mount without the lock card or a password prompt', async () => {
    mockLockData({ hasError: false });
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue({
      post: { content: 'previously unlocked', kind: 'short', attachments: null },
      attachments: [],
    });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    await waitFor(() => expect(screen.getByText('previously unlocked')).toBeInTheDocument());
    expect(LocksController.fetchReplicatedContent).toHaveBeenCalledWith({
      lockUrl: LOCK_URL,
      readerPubky: 'pubkyreader',
    });
    expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument();
  });

  it('reads the creator own content directly when the lock owner is the signed-in user (a == b)', async () => {
    // stripPubkyPrefix('pubkypubkyreader') === 'pubkyreader' === currentUserPubky → own lock.
    const lockFile = asOpaque<LockFile>({ creator: 'pubkypubkyreader' });
    mockLockData({ lockFile });
    vi.mocked(LocksController.fetchOwnContent).mockResolvedValue({
      post: { content: 'my own locked content', kind: 'short', attachments: null },
      attachments: [],
    });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkyreader" />);

    await waitFor(() => expect(screen.getByText('my own locked content')).toBeInTheDocument());
    expect(LocksController.fetchOwnContent).toHaveBeenCalledWith({ lockFile });
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
    // Own lock keeps the lock card (Unlock present but disabled) + a "My locked content" label.
    expect(screen.getByText('My locked content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    expect(screen.queryByText('Unlocked')).not.toBeInTheDocument();
  });

  it('leaves the lock locked when I posted it under a different account (a != b)', async () => {
    // owner ('other') !== me, but I'm the author → my post, other lock account. Phase-2 blocker.
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyother' });
    mockLockData({ lockFile });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkyreader" />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument());
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
  });
});
