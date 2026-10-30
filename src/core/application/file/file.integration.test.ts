import { buildFile } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stripImageMetadata } from '@/libs/image/stripImageMetadata';
import { FileApplication } from './file';

vi.mock('@/libs/image/stripImageMetadata', () => ({ stripImageMetadata: vi.fn() }));
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: { putBlob: vi.fn(), exists: vi.fn(), deleteIdempotent: vi.fn() },
}));
vi.mock('@/services/nexus/file/file', () => ({ NexusFileService: { fetchFiles: vi.fn() } }));

const OWNER = fakeOwner(1);

const toFileAttachment = (name: string, body: string, type = 'application/pdf') =>
  FileApplication.toFileAttachment({ file: new File([body], name, { type }), pubky: OWNER });

// Exercise the real normalizer and the data model's media hashing together: the id of an upload is
// the hash of its bytes, so the same bytes name one file whatever they are called, and different
// bytes never collide, with no clock and no per-tab guard involved.
describe('FileApplication.toFileAttachment with the real pubky-social-specs hashing', () => {
  beforeEach(() => {
    vi.mocked(stripImageMetadata).mockImplementation(async (file) => file);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the media by the hash of its bytes, as buildFile does from the bytes themselves', async () => {
    const attachment = await toFileAttachment('one.pdf', 'one');

    expect(attachment.media).toEqual(
      buildFile(OWNER, { bytes: new TextEncoder().encode('one'), type: 'application/pdf' }),
    );
    expect(attachment.media.url).toBe(`pubky://${OWNER}/pub/social/v1/files/${attachment.media.id}.pdf`);
    expect(attachment.name).toBe('one.pdf');
    expect(attachment.contentType).toBe('application/pdf');
    // The bytes come from Node's realm under jsdom: compare their values, not the array class
    expect(Array.from(attachment.bytes)).toEqual(Array.from(new TextEncoder().encode('one')));
  });

  it('gives identical bytes one URI and different bytes distinct ones, in sequence and concurrently', async () => {
    const [a, b, c, sameAsA] = await Promise.all([
      toFileAttachment('a.pdf', 'alpha'),
      toFileAttachment('b.pdf', 'beta'),
      toFileAttachment('c.pdf', 'gamma'),
      toFileAttachment('renamed.pdf', 'alpha'),
    ]);
    const d = await toFileAttachment('d.pdf', 'delta');

    expect(new Set([a, b, c, d].map((attachment) => attachment.media.url)).size).toBe(4);
    expect(sameAsA.media.url).toBe(a.media.url);
  });

  it('hashes the cleaned file, not the picked one', async () => {
    const cleaned = new File(['cleaned'], 'photo.webp', { type: 'image/webp' });
    vi.mocked(stripImageMetadata).mockResolvedValueOnce(cleaned);

    const attachment = await toFileAttachment('photo.jpg', 'raw-with-exif', 'image/jpeg');

    expect(attachment.media).toEqual(
      buildFile(OWNER, { bytes: new TextEncoder().encode('cleaned'), type: 'image/webp' }),
    );
    expect(attachment.contentType).toBe('image/webp');
    expect(attachment.name).toBe('photo.webp');
  });
});
