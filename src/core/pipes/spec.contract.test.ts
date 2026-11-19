import {
  ArgumentError,
  buildBookmark,
  buildFeed,
  buildFile,
  buildFollow,
  buildMute,
  buildPost,
  buildTag,
  buildUri,
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
 * What this app relies on from `pubky-social-specs` 1.0.0-rc.2 beyond its types: the error
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

  // `@synonymdev/pubky` 0.18 percent-encodes every other byte of a storage path once, where 0.17 and older
  // encoded some of them twice and so stored such a file under its escaped name. A path made of these
  // characters alone goes out as written under both, so a file written before the SDK bump is found after it.
  it('builds every storage path from unreserved characters, whatever the user typed', () => {
    const other = fakeOwner(1);
    const hostile = 'a b/c%20d?e#f"<>{}`ü\\';
    const post = buildPost(owner, { kind: 'note', content: hostile });
    const target = buildUri(other, 'post', post.id);
    const paths = [
      buildUser(owner, { name: 'Ada', bio: hostile }).path,
      post.path,
      buildPost(owner, { kind: 'article', title: hostile, body: hostile }).path,
      buildFollow(owner, other).path,
      buildMute(owner, other).path,
      buildTag(owner, target, 'tag').path,
      buildTag(owner, target, 'ünïcödé').path,
      // A post target encodes to a base64url id; a long one hashes to `~` and a hash id.
      buildBookmark(owner, target).path,
      buildBookmark(owner, `https://example.com/${'a'.repeat(200)}`).path,
      buildFeed(owner, {
        name: hostile,
        icon: 'star',
        reach: 'all',
        layout: 'columns',
        sort: 'recent',
        tags: ['ünïcödé'],
      }).path,
      // The extension comes from the media type table, never from the file's name or a raw type.
      buildFile(owner, { bytes: new Uint8Array([1]), type: hostile }).path,
      ...[...validMimeTypes].map((type) => buildFile(owner, { bytes: new Uint8Array([1]), type }).path),
    ];

    for (const path of paths) expect(path).toMatch(/^\/(pub|priv)\/social\/v1\/[A-Za-z0-9\-_.~/]+$/);
    // Both bookmark forms were built: `~` is the one character here a URL library might escape.
    expect(paths.filter((path) => path.includes('/bookmarks/~'))).toHaveLength(1);
  });
});
