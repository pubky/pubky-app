import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import { usePostLock } from '@/hooks/usePostLock/usePostLock';
import type { UsePostLockResult } from '@/hooks/usePostLock/usePostLock.types';
import type { LockFile } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { LockedPostContent } from './LockedPostContent';

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));

vi.mock('@/hooks/usePostLock/usePostLock', () => ({ usePostLock: vi.fn() }));
vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    unlock: vi.fn(),
    fetchUnlockedContent: vi.fn(),
    replicateUnlockedContent: vi.fn().mockResolvedValue(undefined),
    loadReplicatedContent: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('@/molecules/Toaster/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: 'pubkyreader' }),
}));
vi.mock('../PostBody/PostBody', () => ({
  PostBody: ({ content, localAttachments }: { content: string; localAttachments?: unknown[] }) => (
    <div data-testid="post-body" data-media={localAttachments?.length ?? 0}>
      {content}
    </div>
  ),
}));

const mockUsePostLock = (result: Partial<UsePostLockResult>) =>
  vi.mocked(usePostLock).mockReturnValue({
    lockContent: { lock_title: 'Secret', teaser_description: 'A teaser' },
    lockFile: null,
    verifierType: null,
    hasError: false,
    ...result,
  });

const LOCK_URL = 'pubky://hs/pub/locks.app/lock1.json';

describe('LockedPostContent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastMock.mockClear();
    vi.mocked(LocksController.loadReplicatedContent).mockResolvedValue(null);
    vi.mocked(LocksController.replicateUnlockedContent).mockResolvedValue(undefined);
  });

  it('renders the teaser body and the lock card from the parsed lock content', () => {
    mockUsePostLock({});
    render(<LockedPostContent content="{}" lock={LOCK_URL} />);

    expect(screen.getByText('A teaser')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Secret');
  });

  it('renders nothing when the teaser content is unparseable', () => {
    mockUsePostLock({ lockContent: null });
    const { container } = render(<LockedPostContent content="not json" lock={LOCK_URL} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('enables Unlock when the lock file resolved', () => {
    mockUsePostLock({ hasError: false });
    render(<LockedPostContent content="{}" lock={LOCK_URL} />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();
  });

  it('leaves Unlock inert when the lock file could not be resolved', () => {
    mockUsePostLock({ hasError: true });
    render(<LockedPostContent content="{}" lock={LOCK_URL} />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });

  it('opens the unlock dialog when Unlock is clicked', () => {
    mockUsePostLock({ hasError: false });
    render(<LockedPostContent content="{}" lock={LOCK_URL} />);

    expect(screen.queryByRole('heading', { name: 'Password to Unlock' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(screen.getByRole('heading', { name: 'Password to Unlock' })).toBeInTheDocument();
  });

  it('unlocks, reads the guarded post, and renders its content in place of the card', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkybob' });
    mockUsePostLock({ lockFile });
    vi.mocked(LocksController.unlock).mockResolvedValue({ bundleId: 'b', credential: 'cred', expiresAt: 'e' });
    vi.mocked(LocksController.fetchUnlockedContent).mockResolvedValue({
      post: { content: 'the unlocked secret', kind: 'short', attachments: null },
      attachments: [],
    });
    render(<LockedPostContent content="{}" lock={LOCK_URL} />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'anything' } });
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

  it('renders the unlocked attachments as local object-URL media', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkybob' });
    mockUsePostLock({ lockFile });
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
    render(<LockedPostContent content="{}" lock={LOCK_URL} />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'View Content' }));

    await waitFor(() => expect(screen.getByText('the unlocked secret')).toBeInTheDocument());
    expect(screen.getByText('the unlocked secret')).toHaveAttribute('data-media', '2');
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('toasts (non-blocking) when a guarded attachment is dropped, still rendering the post', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkybob' });
    mockUsePostLock({ lockFile });
    vi.mocked(LocksController.unlock).mockResolvedValue({ bundleId: 'b', credential: 'cred', expiresAt: 'e' });
    vi.mocked(LocksController.fetchUnlockedContent).mockResolvedValue({
      post: {
        content: 'the unlocked secret',
        kind: 'image',
        attachments: ['pubky://b/priv/locks.app/content/a', 'pubky://b/priv/locks.app/content/b'],
      },
      attachments: [{ id: 'a', contentType: 'image/png', bytes: new Uint8Array() }], // one of two dropped
    });
    render(<LockedPostContent content="{}" lock={LOCK_URL} />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'View Content' }));

    // Post still renders (non-blocking) and the reader is warned once.
    await waitFor(() => expect(screen.getByText('the unlocked secret')).toBeInTheDocument());
    expect(toastMock).toHaveBeenCalledWith({ variant: 'error', description: 'Could not load attachments' });
  });

  it('shows already-unlocked content on mount without the lock card or a password prompt', async () => {
    mockUsePostLock({ hasError: false });
    vi.mocked(LocksController.loadReplicatedContent).mockResolvedValue({
      post: { content: 'previously unlocked', kind: 'short', attachments: null },
      attachments: [],
    });
    render(<LockedPostContent content="{}" lock={LOCK_URL} />);

    await waitFor(() => expect(screen.getByText('previously unlocked')).toBeInTheDocument());
    expect(LocksController.loadReplicatedContent).toHaveBeenCalledWith({
      lockUrl: LOCK_URL,
      readerPubky: 'pubkyreader',
    });
    expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument();
  });
});
