import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { asInvalid } from '@/test-utils/type-assertions';
import { ResourceFileCard } from './ResourceFileCard';
import { ResourceItem } from './ResourceItem';

const mocks = vi.hoisted(() => ({
  card: vi.fn(),
  files: vi.fn(),
  push: vi.fn(),
  userDetails: { name: 'Sandbox 01', image: null } as { name: string; image: null } | undefined,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({ usePinakesCard: mocks.card }));
vi.mock('@/hooks/useAttachmentsMetadata/useAttachmentsMetadata', () => ({ useAttachmentsMetadata: mocks.files }));
vi.mock('@/hooks/useUserDetails/useUserDetails', () => ({
  useUserDetails: () => ({ userDetails: mocks.userDetails, isLoading: false }),
}));
vi.mock('@/hooks/useAvatarUrl/useAvatarUrl', () => ({ useAvatarUrl: () => undefined }));
// On screen (jsdom has no layout).
vi.mock('@/hooks/useViewportObserver/useViewportObserver', () => ({
  useViewportObserver: () => ({ ref: () => {}, isVisible: true }),
}));
// The file's address on the CDN, as the attachment parts take it.
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getFileUrl: ({ fileId, variant }: { fileId: string; variant: string }) => `https://cdn.test/${fileId}/${variant}`,
  },
}));
// The action row and tag bar have their own tests; here only what they are given matters.
vi.mock('@/organisms/ResourceActions/ResourceActions', () => ({
  ResourceActions: ({
    uri,
    postUri,
    tagsLabel,
    linkUrl,
    title,
    isOnScreen,
  }: {
    uri: string;
    postUri?: string | null;
    tagsLabel: string;
    linkUrl?: string | null;
    title?: string | null;
    isOnScreen?: boolean;
  }) => (
    <div
      data-testid="resource-actions"
      data-uri={uri}
      data-post-uri={postUri === undefined ? 'default' : (postUri ?? 'none')}
      data-tags-label={tagsLabel}
      data-link-url={linkUrl === undefined ? 'default' : (linkUrl ?? 'none')}
      data-title={title ?? 'none'}
      data-on-screen={String(Boolean(isOnScreen))}
    />
  ),
}));

const KEY = 'apuij4kxbsj1wnh4douy7jptoscrttnkoz9zfo6k8dge1mfyadso';
const TEXT_FILE = `pubky://${KEY}/pub/pubky.app/files/00360YV6W3NZG`;
const IMAGE_FILE = `pubky://${KEY}/pub/pubky.app/files/00360YV6W32EG`;

/** A 0.x file as Nexus serves it (`files/by_ids`). */
const fileRow = (uri: string, name: string, contentType: string, size: number): NexusFileDetails => ({
  id: uri.split('/').pop()!,
  uri,
  owner_id: KEY,
  name,
  content_type: contentType,
  size,
  src: `pubky://${KEY}/pub/pubky.app/blobs/79FSMSJ2FA6SAB2Y2V0QE9Z1P4`,
  created_at: 1794932983331,
  indexed_at: 1794933072235,
  metadata: {},
  urls: { main: '', feed: '', small: '' } as NexusFileDetails['urls'],
});
const NOTE = fileRow(TEXT_FILE, 'note-1.txt', 'text/plain', 89);
const PICTURE = fileRow(IMAGE_FILE, 'picture-0.png', 'image/png', 49348);
const SONG = fileRow(`pubky://${KEY}/pub/pubky.app/files/00360YV6W3P00`, 'song.mp3', 'audio/mpeg', 3 * 1024 * 1024);
const CLIP = fileRow(`pubky://${KEY}/pub/pubky.app/files/00360YV6W3P01`, 'clip.mp4', 'video/mp4', 12 * 1024 * 1024);
/** v1 media: the app reads its details from its URI alone (`FileNormalizer.toV1FileDetails`): no size. */
const MEDIA_URI = `pubky://${KEY}/pub/social/v1/files/AKSZ57W2RFKHV1EHK007FQQ8TW.png`;
const MEDIA = { ...fileRow(MEDIA_URI, 'AKSZ57W2RFKHV1EHK007FQQ8TW.png', 'image/png', 0) };

describe('ResourceItem, a pubky.app object', () => {
  beforeEach(() => {
    mocks.card.mockReset();
    mocks.card.mockReturnValue({ data: null, isLoading: false, isError: false });
    mocks.files.mockReset();
    mocks.push.mockReset();
    mocks.userDetails = { name: 'Sandbox 01', image: null };
    useAuthStore.setState({ currentUserPubky: null });
  });

  it('shows a file as the file: typed File, named by its name, by its owner, never as an external resource', () => {
    mocks.files.mockReturnValue({ files: [NOTE], isLoading: false });
    render(<ResourceItem uri={TEXT_FILE} data-testid="item" />);

    expect(mocks.files).toHaveBeenCalledWith({ fileUris: [TEXT_FILE] });
    // Pinakes reads no pubky.app object: it is never asked.
    expect(mocks.card).not.toHaveBeenCalled();
    const card = screen.getByTestId('resource-file-card');
    expect(within(card).getByTestId('resource-card-type')).toHaveTextContent('File');
    const title = within(card).getByTestId('resource-file-card-title');
    expect(title).toHaveTextContent('note-1.txt');
    expect(title).toHaveAttribute('href', getResourceRoute(TEXT_FILE));
    expect(card).toHaveAttribute('data-click-through', 'true');
    expect(within(card).getByTestId('resource-file-card-details')).toHaveTextContent('text/plain · 89 B');
    const owner = within(card).getByTestId('resource-file-owner');
    expect(owner).toHaveAttribute('href', `/profile/${KEY}`);
    expect(owner).toHaveTextContent('Sandbox 01');
    expect(owner).toHaveAccessibleName('File by Sandbox 01: open their profile');
    // A text file is the file tile that opens it.
    expect(within(card).getByText('note-1.txt', { selector: 'p, span' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Preview file' })).toHaveAttribute(
      'href',
      'https://cdn.test/00360YV6W3NZG/main',
    );
    // No external resource's pieces: no site, no raw path, no "External resource".
    expect(within(card).queryByTestId('resource-card-source')).not.toBeInTheDocument();
    expect(card).not.toHaveTextContent('pubky.app');
    expect(card).not.toHaveTextContent('/pub/');
    expect(card.textContent).not.toMatch(/external resource/i);
    const actions = within(card).getByTestId('resource-actions');
    expect(actions).toHaveAttribute('data-uri', TEXT_FILE);
    expect(actions).toHaveAttribute('data-tags-label', 'Tags on this file');
    expect(actions).toHaveAttribute('data-post-uri', 'none');
    expect(actions).toHaveAttribute('data-link-url', 'none');
    expect(actions).toHaveAttribute('data-title', 'note-1.txt');
    expect(actions).toHaveAttribute('data-on-screen', 'true');
    // The item is the card, on no surface of its own.
    expect(screen.getByTestId('item')).not.toHaveClass('bg-card');
  });

  it('shows an image file inline, its size in the largest unit', () => {
    mocks.files.mockReturnValue({ files: [PICTURE], isLoading: false });
    render(<ResourceItem uri={IMAGE_FILE} />);

    const card = screen.getByTestId('resource-file-card');
    expect(within(card).getByAltText('picture-0.png')).toBeInTheDocument();
    expect(within(card).getByTestId('resource-file-card-details')).toHaveTextContent('image/png · 48.2 KB');
    expect(within(card).queryByRole('link', { name: 'Preview file' })).not.toBeInTheDocument();
  });

  it.each([
    ['an audio file in the app’s audio player', SONG, 'audio', 'audio/mpeg · 3 MB'],
    ['a video file inline', CLIP, 'video', 'video/mp4 · 12 MB'],
  ])('shows %s', (_, file, tag, details) => {
    mocks.files.mockReturnValue({ files: [file], isLoading: false });
    const { container } = render(<ResourceItem uri={file.uri} />);

    expect(container.querySelector(tag)).toHaveAttribute('src', `https://cdn.test/${file.id}/main`);
    expect(screen.getByTestId('resource-file-card-details')).toHaveTextContent(details);
    expect(screen.queryByRole('link', { name: 'Preview file' })).not.toBeInTheDocument();
  });

  it('shows v1 media by its file name and type, with no size it does not know', () => {
    mocks.files.mockReturnValue({ files: [MEDIA], isLoading: false });
    render(<ResourceItem uri={MEDIA_URI} />);

    expect(screen.getByTestId('resource-file-card-title')).toHaveTextContent('AKSZ57W2RFKHV1EHK007FQQ8TW.png');
    expect(screen.getByTestId('resource-file-card-details').textContent).toBe('image/png');
    expect(mocks.card).not.toHaveBeenCalled();
  });

  it('opens the file’s page on a click on the card, never on a press on the file or its owner', () => {
    mocks.files.mockReturnValue({ files: [NOTE], isLoading: false });
    render(<ResourceItem uri={TEXT_FILE} />);

    fireEvent.click(screen.getByRole('link', { name: 'Preview file' }));
    fireEvent.click(screen.getByTestId('resource-file-owner'));
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('resource-file-card-details'));
    expect(mocks.push).toHaveBeenCalledWith(getResourceRoute(TEXT_FILE));
  });

  it('keeps an image, its lightbox’s trigger, among the card’s own controls', () => {
    mocks.files.mockReturnValue({ files: [PICTURE], isLoading: false });
    render(<ResourceItem uri={IMAGE_FILE} />);

    expect(screen.getByAltText('picture-0.png').closest('[data-resource-controls]')).not.toBeNull();
  });

  it('reads the file by the URI Nexus keys, and shows a row without a type as the file tile', () => {
    // A row as remote data may come: no `content_type`.
    const untyped = { ...NOTE, content_type: asInvalid<string>(undefined) };
    mocks.files.mockReturnValue({ files: [untyped], isLoading: false });
    render(<ResourceItem uri={`PUBKY://${KEY}/pub/pubky.app/files/00360YV6W3NZG?v=1`} />);

    expect(mocks.files).toHaveBeenCalledWith({ fileUris: [TEXT_FILE] });
    expect(screen.getByRole('link', { name: 'Preview file' })).toBeInTheDocument();
    expect(screen.getByTestId('resource-file-card-details')).toHaveTextContent('89 B');
  });

  it('names a file Nexus gives no name "File", in its title and its tile', () => {
    mocks.files.mockReturnValue({ files: [{ ...NOTE, name: '' }], isLoading: false });
    render(<ResourceItem uri={TEXT_FILE} />);

    expect(screen.getByTestId('resource-file-card-title')).toHaveTextContent('File');
    expect(screen.getByText('File', { selector: 'p, span:not([data-testid])' })).toBeInTheDocument();
  });

  it('opens the viewer’s own profile from their file, and from a row of their profile, as `/profile`', () => {
    useAuthStore.setState({ currentUserPubky: KEY });
    mocks.files.mockReturnValue({ files: [NOTE], isLoading: false });
    const { unmount } = render(<ResourceItem uri={TEXT_FILE} />);
    expect(screen.getByTestId('resource-file-owner')).toHaveAttribute('href', '/profile');
    unmount();

    render(<ResourceItem uri={`pubky://${KEY}/pub/pubky.app/profile.json`} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/profile');
  });

  it('never asks Pinakes about anything else in pubky.app’s trees: a quiet row at once', () => {
    render(<ResourceItem uri={`pubky://${KEY}/pub/pubky.app/blobs/79FSMSJ2FA6SAB2Y2V0QE9Z1P4`} />);

    expect(mocks.card).toHaveBeenCalledWith(null);
    expect(screen.getByRole('link')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-card-skeleton')).not.toBeInTheDocument();
  });

  it('names the owner by their key until their profile is read', () => {
    mocks.userDetails = undefined;
    mocks.files.mockReturnValue({ files: [NOTE], isLoading: false });
    render(<ResourceItem uri={TEXT_FILE} />);

    expect(screen.getByTestId('resource-file-owner').textContent).not.toBe('');
    expect(screen.getByTestId('resource-file-owner')).toHaveAttribute('href', `/profile/${KEY}`);
  });

  it('holds the card’s place while the file is read', () => {
    mocks.files.mockReturnValue({ files: [], isLoading: true });
    render(<ResourceItem uri={TEXT_FILE} />);

    expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows a file Nexus does not know as a quiet row named File, opening its page', () => {
    mocks.files.mockReturnValue({ files: [], isLoading: false });
    render(<ResourceItem uri={TEXT_FILE} data-testid="item" />);

    const row = screen.getByRole('link');
    expect(row.textContent).toBe('File');
    expect(row).toHaveAttribute('href', getResourceRoute(TEXT_FILE));
    expect(screen.getByTestId('item')).toHaveClass('bg-card');
    expect(screen.queryByTestId('resource-file-card')).not.toBeInTheDocument();
    expect(mocks.card).not.toHaveBeenCalled();
  });

  it.each([
    [`pubky://${KEY}/pub/pubky.app/posts/00360YV6W3NZG`, 'Post', `/post/${KEY}/00360YV6W3NZG`],
    [`pubky://${KEY}/pub/social/v1/posts/00360YV6W3NZG`, 'Post', `/post/${KEY}/00360YV6W3NZG`],
    [`pubky://${KEY}/pub/pubky.app/profile.json`, 'Profile', `/profile/${KEY}`],
  ])('shows %s as a row opening its own page', (uri, name, page) => {
    render(<ResourceItem uri={uri} />);

    const row = screen.getByRole('link');
    expect(row.textContent).toBe(name);
    expect(row).toHaveAttribute('href', page);
    expect(mocks.card).not.toHaveBeenCalled();
    expect(mocks.files).not.toHaveBeenCalled();
  });

  it('still asks Pinakes about another Pubky app’s object', () => {
    const deck = `pubky://${KEY}/pub/loopky/decks/english3000-ha/manifest.json`;
    render(<ResourceItem uri={deck} />);

    expect(mocks.card).toHaveBeenCalledWith(deck);
    expect(mocks.files).not.toHaveBeenCalled();
  });
});

describe('ResourceFileCard, large', () => {
  beforeEach(() => {
    mocks.userDetails = { name: 'Sandbox 01', image: null };
  });

  it('heads the file’s page: its name the heading and no link, no click-through', () => {
    render(<ResourceFileCard uri={TEXT_FILE} ownerId={KEY} file={NOTE} size="large" />);

    const card = screen.getByTestId('resource-file-card');
    expect(card).toHaveAttribute('data-size', 'large');
    expect(card).not.toHaveAttribute('data-click-through');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('note-1.txt');
    expect(screen.getByTestId('resource-file-card-title')).not.toHaveAttribute('href');
  });

  it('names a file Nexus does not know "File", with its owner and nothing else', () => {
    render(<ResourceFileCard uri={TEXT_FILE} ownerId={KEY} file={null} size="large" />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('File');
    expect(screen.queryByTestId('resource-file-card-details')).not.toBeInTheDocument();
    expect(screen.getByTestId('resource-file-owner')).toHaveAttribute('href', `/profile/${KEY}`);
    expect(screen.queryByRole('link', { name: 'Preview file' })).not.toBeInTheDocument();
  });
});
