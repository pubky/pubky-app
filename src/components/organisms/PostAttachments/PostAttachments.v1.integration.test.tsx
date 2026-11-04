import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { buildFile } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileApplication } from '@/application/file/file';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { getCdnUrl, getV1CdnUrl } from '@/config/nexus';
import { useAttachmentsMetadata } from '@/hooks/useAttachmentsMetadata/useAttachmentsMetadata';
import { usePostAttachmentsMedia } from '@/hooks/usePostAttachmentsMedia/usePostAttachmentsMedia';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { httpResponseToError } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { FileDetailsModel } from '@/models/file/fileDetails';
import type { Pubky } from '@/models/models.types';
import { NexusFileService } from '@/services/nexus/file/file';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { PostAttachments } from './PostAttachments';
import { splitAttachmentsByMediaType } from './PostAttachments.helpers';

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({ usePostDetails: vi.fn() }));
vi.mock('@/molecules/Toaster/toast');

const OTHER = fakeOwner(2) as Pubky;
const v1File = (byte: number, type: string) => buildFile(OTHER, { bytes: new Uint8Array([byte]), type });

const png = v1File(1, 'image/png');
const mp4 = v1File(2, 'video/mp4');
const mp3 = v1File(3, 'audio/mpeg');
const pdf = v1File(4, 'application/pdf');
const LEGACY_ID = '0034A0X7NJ52C';
const legacyUri = `pubky://${OTHER}/pub/pubky.app/files/${LEGACY_ID}`;

const v1Url = (file: { id: string }, ext: string, variant: string) =>
  `${getV1CdnUrl()}/files/${OTHER}/${file.id}.${ext}/${variant}`;

const row = (
  overrides: Partial<NexusFileDetails> & Pick<NexusFileDetails, 'id' | 'uri' | 'name'>,
): NexusFileDetails => ({
  src: overrides.uri,
  content_type: 'image/png',
  size: 10,
  created_at: 1,
  indexed_at: 1,
  metadata: {},
  owner_id: OTHER,
  urls: { main: '', feed: '', small: '' },
  ...overrides,
});

// Real hook, controller, application and IndexedDB; only the Nexus `by_ids` request is a spy. The
// attachments of a user this device never saw: Nexus keeps no metadata for v1 files, so they have no row.
describe('PostAttachments for another user v1 attachments', () => {
  const byIds = vi.spyOn(NexusFileService, 'fetchFiles');

  const resolved = (fileUris: string[]) =>
    renderHook(() => {
      const { files, isLoading } = useAttachmentsMetadata({ fileUris });
      return { ...splitAttachmentsByMediaType(files), isLoading };
    });

  beforeEach(async () => {
    byIds.mockReset();
    byIds.mockImplementation(async (uris) => {
      if (uris.some((uri) => uri.includes('/social/v1/'))) {
        throw httpResponseToError(new Response(null, { status: 400 }), ErrorService.Nexus, 'fetchFiles', 'by_ids');
      }
      return [];
    });
    await FileDetailsModel.table.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders each kind from its extension, on the v1 route, without asking Nexus', async () => {
    const { result } = resolved([png.url, mp4.url, mp3.url, pdf.url]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.imagesAndVideos).toEqual([
      {
        type: 'image/png',
        name: `${png.id}.png`,
        urls: { main: v1Url(png, 'png', 'main'), feed: v1Url(png, 'png', 'feed') },
      },
      { type: 'video/mp4', name: `${mp4.id}.mp4`, urls: { main: v1Url(mp4, 'mp4', 'main'), feed: undefined } },
    ]);
    expect(result.current.audios).toEqual([
      { type: 'audio/mpeg', name: `${mp3.id}.mp3`, urls: { main: v1Url(mp3, 'mp3', 'main'), feed: undefined } },
    ]);
    expect(result.current.genericFiles).toEqual([
      { type: 'application/pdf', name: `${pdf.id}.pdf`, urls: { main: v1Url(pdf, 'pdf', 'main'), feed: undefined } },
    ]);
    expect(byIds).not.toHaveBeenCalled();
  });

  it('lets a real row win over the fallback', async () => {
    await FileDetailsModel.bulkSave([
      row({ id: `${OTHER}:${png.id}`, uri: png.url, name: 'holiday.png', metadata: { width: '640', height: '480' } }),
    ]);

    const { result } = resolved([png.url]);

    await waitFor(() => expect(result.current.imagesAndVideos[0]?.name).toBe('holiday.png'));
    expect(result.current.imagesAndVideos).toEqual([
      {
        type: 'image/png',
        name: 'holiday.png',
        width: 640,
        height: 480,
        urls: { main: v1Url(png, 'png', 'main'), feed: v1Url(png, 'png', 'feed') },
      },
    ]);
    expect(byIds).not.toHaveBeenCalled();
  });

  it('still asks Nexus for a 0.x file beside v1 ones, naming only the 0.x address', async () => {
    byIds.mockResolvedValueOnce([
      row({ id: legacyUri, uri: legacyUri, name: 'old.png', urls: { main: 'm', feed: 'f', small: 's' } }),
    ]);

    const { result } = resolved([png.url, legacyUri]);

    await waitFor(() => expect(result.current.imagesAndVideos).toHaveLength(2));
    expect(byIds).toHaveBeenCalledExactlyOnceWith([legacyUri]);
    expect(result.current.imagesAndVideos.map(({ urls }) => urls.main)).toEqual([
      `${getCdnUrl()}/files/${OTHER}/${LEGACY_ID}/main`,
      v1Url(png, 'png', 'main'),
    ]);
  });

  it('never sends by_ids a v1 address, canonical or not', async () => {
    const malformed = png.url.replace('.png', '.PNG');

    await FileApplication.fetchFiles([png.url, malformed]);
    expect(byIds).not.toHaveBeenCalled();

    await FileApplication.fetchFiles([png.url, malformed, legacyUri]);
    expect(byIds).toHaveBeenCalledExactlyOnceWith([legacyUri]);
  });

  it('shows the image in the rendered post and a file card for a non-media type', async () => {
    render(<PostAttachments attachments={[png.url, pdf.url]} localAttachments={undefined} />);

    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringContaining('/v1/static/')));
    expect(screen.getByRole('img')).toHaveAttribute('src', v1Url(png, 'png', 'feed'));
    expect(screen.getByRole('link', { name: 'Preview file' })).toHaveAttribute('href', v1Url(pdf, 'pdf', 'main'));
    expect(byIds).not.toHaveBeenCalled();
  });

  it('gives usePostAttachmentsMedia the media of a post whose files have no row', async () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: asOpaque<EnrichedPostDetails>({ kind: 'image', content: '', attachments: [png.url, pdf.url] }),
      isLoading: false,
    });

    const { result } = renderHook(() => usePostAttachmentsMedia('author:post'));

    await waitFor(() => expect(result.current.mediaItems).toHaveLength(1));
    expect(result.current.mediaItems[0].urls.main).toBe(v1Url(png, 'png', 'main'));
  });
});
