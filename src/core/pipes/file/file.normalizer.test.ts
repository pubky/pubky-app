import { buildFile, limits, validMimeTypes } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { FileNormalizer } from '@/pipes/file/file.normalizer';

const OWNER = fakeOwner(1);
const BYTES = new Uint8Array([1, 2, 3, 4, 5]);
const file = (name = 'test-image.png', type = 'image/png') => new File([BYTES], name, { type });

describe('FileNormalizer.toV1FileDetails', () => {
  const v1Uri = (type: string) => buildFile(OWNER, { bytes: BYTES, type }).url;

  it('says what the URI says: the type from the extension, the filename as the name', () => {
    const { id, url } = buildFile(OWNER, { bytes: BYTES, type: 'image/png' });

    expect(FileNormalizer.toV1FileDetails(url)).toEqual({
      id: `${OWNER}:${id}`,
      name: `${id}.png`,
      src: url,
      uri: url,
      content_type: 'image/png',
      size: 0,
      created_at: 0,
      indexed_at: 0,
      metadata: {},
      owner_id: OWNER,
      urls: { main: '', feed: '', small: '' },
    });
  });

  it.each([
    ['image/jpeg', 'image/jpeg'],
    ['image/gif', 'image/gif'],
    ['image/webp', 'image/webp'],
    ['image/svg+xml', 'image/svg+xml'],
    ['video/mp4', 'video/mp4'],
    ['video/mpeg', 'video/mpeg'],
    ['audio/mpeg', 'audio/mpeg'],
    ['audio/wav', 'audio/wav'],
    ['application/pdf', 'application/pdf'],
    ['text/csv', 'text/csv'],
    // Types sharing an extension read back as the first one listed.
    ['text/xml', 'application/xml'],
    ['multipart/form-data', 'application/octet-stream'],
    ['application/x-www-form-urlencoded', 'application/octet-stream'],
  ])('reads a file declared %s back as %s', (declared, read) => {
    expect(FileNormalizer.toV1FileDetails(v1Uri(declared))?.content_type).toBe(read);
  });

  it('reverses the data model for every type: the type it reads gives the same file name again', () => {
    for (const type of validMimeTypes) {
      const uri = v1Uri(type);
      const read = FileNormalizer.toV1FileDetails(uri)?.content_type;

      expect(read && v1Uri(read), type).toBe(uri);
    }
  });

  it.each([
    ['a 0.x file', `pubky://${OWNER}/pub/pubky.app/files/0034A0X7NJ52C`],
    ['a private file', buildFile(OWNER, { bytes: BYTES, type: 'image/png', root: 'private' }).url],
    ['a post', `pubky://${OWNER}/pub/social/v1/posts/0034A0X7NJ52C`],
    ['an upper-case extension', v1Uri('image/png').replace('.png', '.PNG')],
    ['an unknown extension', v1Uri('image/png').replace('.png', '.exe')],
    ['a bare hash', v1Uri('image/png').replace('.png', '')],
    ['a double extension', v1Uri('image/png').replace('.png', '.png.png')],
    ['an https URL', 'https://example.com/a.png'],
    ['nothing', ''],
  ])('is null for %s', (_label, uri) => {
    expect(FileNormalizer.toV1FileDetails(uri)).toBeNull();
  });
});

describe('FileNormalizer.toFileAttachment', () => {
  it('names the media by its hash and the extension of its type, and keeps the bytes and the picked name', () => {
    const media = buildFile(OWNER, { bytes: BYTES, type: 'image/png' });

    const result = FileNormalizer.toFileAttachment({ file: file(), mediaId: media.id, blobData: BYTES, pubky: OWNER });

    expect(result.media).toEqual(media);
    expect(result.media.url).toBe(`pubky://${OWNER}/pub/social/v1/files/${media.id}.png`);
    expect(result.bytes).toBe(BYTES);
    expect(result.name).toBe('test-image.png');
    expect(result.contentType).toBe('image/png');
    expect(result.preexisting).toBeUndefined();
  });

  it('names the same bytes the same whatever the file is called: media is content addressed', () => {
    const { id } = buildFile(OWNER, { bytes: BYTES, type: 'image/png' });

    const a = FileNormalizer.toFileAttachment({ file: file('a.png'), mediaId: id, blobData: BYTES, pubky: OWNER });
    const b = FileNormalizer.toFileAttachment({ file: file('b.png'), mediaId: id, blobData: BYTES, pubky: OWNER });

    expect(a.media.url).toBe(b.media.url);
  });

  it.each([
    ['application/pdf', 'pdf'],
    ['video/mp4', 'mp4'],
    ['audio/mpeg', 'mp3'],
    ['image/svg+xml', 'svg'],
    ['application/octet-stream', 'bin'],
    ['', 'bin'],
  ])('picks the extension of the declared type %s (%s)', (type, extension) => {
    const { id } = buildFile(OWNER, { bytes: BYTES, type });

    const result = FileNormalizer.toFileAttachment({
      file: file('x', type),
      mediaId: id,
      blobData: BYTES,
      pubky: OWNER,
    });

    expect(result.media.path).toBe(`/pub/social/v1/files/${id}.${extension}`);
  });

  it('refuses empty bytes and bytes over the size limit, which the builder never sees with an id', () => {
    const { id } = buildFile(OWNER, { bytes: BYTES, type: 'image/png' });
    const refuse = (blobData: Uint8Array) =>
      FileNormalizer.toFileAttachment({ file: file(), mediaId: id, blobData, pubky: OWNER });

    expect(() => refuse(new Uint8Array())).toThrow(AppError);
    let caught: unknown;
    try {
      refuse(new Uint8Array(limits.maxFileSizeBytes + 1));
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      category: ErrorCategory.Validation,
      code: ValidationErrorCode.INVALID_INPUT,
      service: ErrorService.SocialSpecs,
      operation: 'toFileAttachment',
      context: expect.objectContaining({ limit: limits.maxFileSizeBytes }),
    });
  });

  it("wraps the data model's refusal of a bad id or owner with its code and field", () => {
    let caught: unknown;
    try {
      FileNormalizer.toFileAttachment({ file: file(), mediaId: 'not-a-hash', blobData: BYTES, pubky: OWNER });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({
      service: ErrorService.SocialSpecs,
      operation: 'buildFile',
      context: expect.objectContaining({ code: 'format', name: 'test-image.png', type: 'image/png' }),
    });

    const { id } = buildFile(OWNER, { bytes: BYTES, type: 'image/png' });
    expect(() =>
      FileNormalizer.toFileAttachment({ file: file(), mediaId: id, blobData: BYTES, pubky: 'invalid-pubky' }),
    ).toThrow(AppError);
  });
});
