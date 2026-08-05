import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import type { ReplicatedPost } from '@/services/locks/locks.types';
import { ProfileUnlockedCard } from './ProfileUnlockedCard';

// The card renders through PostBody → PostText, which reads the route to decide truncation.
vi.mock('next/navigation', () => ({ usePathname: () => '/profile/unlocked' }));
vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { fetchReplicatedAttachments: vi.fn().mockResolvedValue([]) },
}));

const post = (attachments: ReplicatedPost['attachments'] = null): ReplicatedPost => ({
  content: 'secret body',
  kind: 'short',
  attachments,
});

describe('ProfileUnlockedCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(LocksController.fetchReplicatedAttachments).mockResolvedValue([]);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:media');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('renders the post text', () => {
    render(<ProfileUnlockedCard post={post()} />);

    expect(screen.getByText('secret body')).toBeInTheDocument();
  });

  it('skips the media read when the post has no attachments', async () => {
    render(<ProfileUnlockedCard post={post()} />);

    await Promise.resolve();
    expect(LocksController.fetchReplicatedAttachments).not.toHaveBeenCalled();
  });

  it('loads the bytes for a post that has attachments', async () => {
    const attachments = [{ url: 'pubky://me/priv/social/unlocked/LOCK1/img1', content_type: 'image/png' }];
    vi.mocked(LocksController.fetchReplicatedAttachments).mockResolvedValue([
      { id: 'img1', contentType: 'image/png', bytes: new Uint8Array([1]) },
    ]);

    render(<ProfileUnlockedCard post={post(attachments)} />);

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    expect(LocksController.fetchReplicatedAttachments).toHaveBeenCalledWith({ post: post(attachments) });
  });

  // The kinds a locked post can carry, per `inferPostKindForCreate`. Collection is unreachable here.
  describe('by post kind', () => {
    const withMedia = async (contentType: string) => {
      vi.mocked(LocksController.fetchReplicatedAttachments).mockResolvedValue([
        { id: 'file1', contentType, bytes: new Uint8Array([1]) },
      ]);
      return [{ url: 'pubky://me/priv/social/unlocked/LOCK1/file1', content_type: contentType }];
    };

    it('short: renders the body text', () => {
      render(<ProfileUnlockedCard post={{ ...post(), kind: 'short' }} />);

      expect(screen.getByText('secret body')).toBeInTheDocument();
    });

    it('long: renders the article title, which plain body text would drop', () => {
      const content = JSON.stringify({ title: 'My Title', body: 'Body' });

      render(<ProfileUnlockedCard post={{ ...post(), kind: 'long', content }} />);

      expect(screen.getByText('My Title')).toBeInTheDocument();
    });

    it('link: renders the URL from the body', () => {
      render(<ProfileUnlockedCard post={{ ...post(), kind: 'link', content: 'https://example.com/article' }} />);

      expect(screen.getByText('https://example.com/article')).toBeInTheDocument();
    });

    it('image: renders the attachment from its object URL', async () => {
      const attachments = await withMedia('image/png');

      render(<ProfileUnlockedCard post={{ ...post(attachments), kind: 'image' }} />);

      await waitFor(() => expect(screen.getByAltText('attachment-0')).toHaveAttribute('src', 'blob:media'));
    });

    it('video: renders the attachment from its object URL', async () => {
      const attachments = await withMedia('video/mp4');

      const { container } = render(<ProfileUnlockedCard post={{ ...post(attachments), kind: 'video' }} />);

      await waitFor(() => expect(container.querySelector('video')).toHaveAttribute('src', 'blob:media'));
    });

    it('file: renders the download entry with its name', async () => {
      const attachments = await withMedia('application/pdf');

      render(<ProfileUnlockedCard post={{ ...post(attachments), kind: 'file' }} />);

      await waitFor(() => expect(screen.getByText('attachment-0')).toBeInTheDocument());
    });
  });

  it('expands a truncated body in place — an unlocked copy has no post page to navigate to', async () => {
    const long = 'x'.repeat(1200);
    const user = userEvent.setup();

    render(<ProfileUnlockedCard post={{ ...post(), content: long }} />);
    const showMore = screen.getByRole('button', { name: 'Show full post content' });

    await user.click(showMore);

    expect(screen.getByText(long)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
  });

  it('renders the surviving media when the replica lost some attachments', async () => {
    // The application drops the 404s; the card must still show the text and whatever came back.
    const refs = Array.from({ length: 5 }, (_, index) => ({
      url: `pubky://me/priv/social/unlocked/LOCK1/img${index}`,
      content_type: 'image/png',
    }));
    vi.mocked(LocksController.fetchReplicatedAttachments).mockResolvedValue(
      [0, 2, 4].map((index) => ({ id: `img${index}`, contentType: 'image/png', bytes: new Uint8Array([index]) })),
    );

    render(<ProfileUnlockedCard post={post(refs)} />);

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3));
    expect(screen.getByText('secret body')).toBeInTheDocument();
  });

  it('releases the object URLs on unmount, so the blobs are not leaked', async () => {
    vi.mocked(LocksController.fetchReplicatedAttachments).mockResolvedValue([
      { id: 'img1', contentType: 'image/png', bytes: new Uint8Array([1]) },
    ]);
    const attachments = [{ url: 'pubky://me/priv/social/unlocked/LOCK1/img1', content_type: 'image/png' }];

    const { unmount } = render(<ProfileUnlockedCard post={post(attachments)} />);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:media');
  });
});
