import { buildFile, limits } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { FileNormalizer } from '@/pipes/file/file.normalizer';

const OWNER = fakeOwner(1);
const BYTES = new Uint8Array([1, 2, 3, 4, 5]);
const file = (name = 'test-image.png', type = 'image/png') => new File([BYTES], name, { type });

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

  it("names a CSV upload with its own extension: text/csv is in the data model's list", () => {
    const media = buildFile(OWNER, { bytes: BYTES, type: 'text/csv' });

    const result = FileNormalizer.toFileAttachment({
      file: file('table.csv', 'text/csv'),
      mediaId: media.id,
      blobData: BYTES,
      pubky: OWNER,
    });

    expect(result.media.url).toBe(`pubky://${OWNER}/pub/social/v1/files/${media.id}.csv`);
    expect(result.contentType).toBe('text/csv');
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
