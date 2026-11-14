import {
  ArgumentError,
  buildFile,
  buildUser,
  type ErrorCode,
  limits,
  parseUri,
  ValidationError,
  validMimeTypes,
} from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';

/**
 * What this app relies on from `pubky-social-specs` 1.0.0-rc.1 beyond its types: the error
 * contract the pipes classify by, the limits `src/config/*` turns into policy, and the file
 * extension table that names v1 media. A release that changes any of these fails here, not in
 * a user's browser.
 */

/** The closed `ErrorCode` set, as `docs/reference.md` of the package lists it. */
const ERROR_CODES = [
  'json',
  'size',
  'length',
  'count',
  'blank',
  'format',
  'id',
  'reference',
  'unknown_name',
  'unsafe_integer',
  'path',
  'conflict',
  'migration',
] as const satisfies readonly ErrorCode[];
// Both directions: every member above is an ErrorCode, and no ErrorCode is missing above.
type MissingCode = Exclude<ErrorCode, (typeof ERROR_CODES)[number]>;
const noMissingCode: MissingCode extends never ? true : never = true;

/** The media type to extension table of `docs/reference.md` (Media types). */
const EXTENSION_BY_MIME: Record<(typeof validMimeTypes)[number], string> = {
  'application/javascript': '.js',
  'application/json': '.json',
  'application/octet-stream': '.bin',
  'application/pdf': '.pdf',
  'application/x-www-form-urlencoded': '.bin',
  'application/xml': '.xml',
  'application/zip': '.zip',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
  'multipart/form-data': '.bin',
  'text/css': '.css',
  'text/csv': '.csv',
  'text/html': '.html',
  'text/plain': '.txt',
  'text/xml': '.xml',
  'video/mp4': '.mp4',
  'video/mpeg': '.mpeg',
};

const caught = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('pubky-social-specs contract', () => {
  const owner = fakeOwner(1);

  it('refuses a value with a ValidationError carrying a code from the closed set, the field and the limit', () => {
    expect(noMissingCode).toBe(true);
    const error = caught(() => buildUser(owner, { name: 'Al' }));

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'ValidationError',
      code: 'length',
      field: 'name',
      limit: limits.userNameMinLength,
    });
    expect(ERROR_CODES).toContain((error as ValidationError).code);
    expect((error as ValidationError).message.startsWith('Validation Error: ')).toBe(true);
  });

  it('keeps instanceof across a copy of the package by branding, not by class identity', () => {
    const error = caught(() => parseUri('not a uri')) as ValidationError;
    const foreignCopy = Object.create(Object.create(Error.prototype), Object.getOwnPropertyDescriptors(error));

    expect(error.code).toBe('path');
    expect(foreignCopy).not.toBe(error);
    expect(Object.getPrototypeOf(foreignCopy)).not.toBe(ValidationError.prototype);
    expect(foreignCopy instanceof ValidationError).toBe(true);
    expect({} instanceof ValidationError).toBe(false);
  });

  it("refuses a caller's wrong-shaped value with an ArgumentError, which is a TypeError, not a rule", () => {
    const error = caught(() => buildUser(owner, { name: 1 as never }));

    expect(error).toBeInstanceOf(ArgumentError);
    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ field: 'input.name' });
  });

  it('pins the limits src/config/* turns into product policy', () => {
    expect(limits).toMatchObject({
      articleBodyMaxLength: 50_000,
      articleTitleMaxLength: 100,
      collectionContentMaxLength: 40_000,
      collectionDescriptionMaxLength: 500,
      collectionItemsMaxCount: 100,
      collectionNameMaxLength: 100,
      feedIconMaxLength: 50,
      feedTagsMaxCount: 5,
      imageUrlMaxLength: 300,
      maxFileSizeBytes: 104_857_600,
      postAllowedAttachmentProtocols: ['pubky', 'http', 'https'],
      postAttachmentsMaxCount: 10,
      postNoteContentMaxLength: 2000,
      referenceUriMaxLength: 1024,
      tagLabelMaxLength: 20,
      userBioMaxLength: 160,
      userLinkTitleMaxLength: 100,
      userLinkUrlMaxLength: 300,
      userLinksMaxCount: 5,
      userNameMaxLength: 50,
      userNameMinLength: 3,
      userStatusMaxLength: 50,
    });
  });

  it('names every valid media type in the extension table, and nothing else', () => {
    expect([...validMimeTypes].sort()).toEqual(Object.keys(EXTENSION_BY_MIME).sort());
  });

  it.each([...validMimeTypes])('names a %s file by its hash and the extension of the table', (type) => {
    const built = buildFile(owner, { bytes: new Uint8Array([1, 2, 3]), type });

    expect(built.path).toBe(`/pub/social/v1/files/${built.id}${EXTENSION_BY_MIME[type]}`);
    expect(built.url).toBe(`pubky://${owner}${built.path}`);
    expect(parseUri(built.url)).toMatchObject({ kind: 'file', root: 'public', id: built.id });
  });

  it('matches a media type on its essence and gives an unknown one .bin', () => {
    expect(buildFile(owner, { bytes: new Uint8Array([1]), type: 'IMAGE/PNG; charset=binary' }).path).toMatch(/\.png$/);
    expect(buildFile(owner, { bytes: new Uint8Array([1]), type: 'application/x-unknown' }).path).toMatch(/\.bin$/);
  });
});
