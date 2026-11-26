// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { encodeJson } from '../../fakeNetwork';
import { ALICE, BRAN } from '../social.fixtures';
import { legacyBlobUri, legacyFileUriOf, legacyId } from './legacy.fixtures';
import { legacyFileUri, readLegacyFile } from './legacyMedia';

const fileId = legacyId(1);
const BYTES = new Uint8Array([1, 2, 3]);

/** A reader over `files`, by URI, that records what it was asked for. */
function reader(files: Record<string, Uint8Array>) {
  const asked: string[] = [];
  const read = async (uri: string) => {
    asked.push(uri);
    return files[uri] ?? null;
  };
  return { read, asked };
}

const record = (src: string, contentType = 'image/png') =>
  encodeJson({ name: 'cat.png', created_at: 1, src, content_type: contentType, size: 3 });

describe('legacyFileUri', () => {
  it('names an owner file record by its timestamp id, and nothing else', () => {
    expect(legacyFileUri(ALICE, fileId)).toBe(legacyFileUriOf(ALICE, fileId));
    expect(legacyFileUri(ALICE, 'abc.png')).toBeNull();
    expect(legacyFileUri('alice', fileId)).toBeNull();
  });
});

describe('readLegacyFile', () => {
  it('reads the blob the record points at, with the type the record states', async () => {
    const { read, asked } = reader({
      [legacyFileUriOf(ALICE, fileId)]: record(` ${legacyBlobUri(ALICE, 'BLOB1')} `, ' image/png '),
      [legacyBlobUri(ALICE, 'BLOB1')]: BYTES,
    });

    expect(await readLegacyFile(legacyFileUriOf(ALICE, fileId), read)).toEqual({
      bytes: BYTES,
      contentType: 'image/png',
    });
    expect(asked).toEqual([legacyFileUriOf(ALICE, fileId), legacyBlobUri(ALICE, 'BLOB1')]);
  });

  it('reads nothing for a URI of no older file', async () => {
    const { read, asked } = reader({});

    expect(await readLegacyFile('pubky://x/pub/social/v1/files/abc.png', read)).toBeNull();
    expect(await readLegacyFile(`${legacyFileUriOf(ALICE, fileId)}/more`, read)).toBeNull();
    expect(await readLegacyFile('https://example.com/cat.png', read)).toBeNull();
    expect(asked).toEqual([]);
  });

  it.each<[string, Record<string, Uint8Array>]>([
    ['a missing record', {}],
    ['a record of no JSON', { [legacyFileUriOf(ALICE, fileId)]: new TextEncoder().encode('{') }],
    ['a blob of another owner', { [legacyFileUriOf(ALICE, fileId)]: record(legacyBlobUri(BRAN, 'BLOB1')) }],
    ['a source that is no blob', { [legacyFileUriOf(ALICE, fileId)]: record('https://example.com/cat.png') }],
    ['an unknown type', { [legacyFileUriOf(ALICE, fileId)]: record(legacyBlobUri(ALICE, 'BLOB1'), 'image/x-cat') }],
    ['a missing blob', { [legacyFileUriOf(ALICE, fileId)]: record(legacyBlobUri(ALICE, 'BLOB1')) }],
  ])('reads nothing for %s', async (_name, files) => {
    const { read } = reader({ ...files, [legacyBlobUri(BRAN, 'BLOB1')]: BYTES });

    expect(await readLegacyFile(legacyFileUriOf(ALICE, fileId), read)).toBeNull();
  });

  it('rejects when the reader does', async () => {
    const failure = new Error('too large');
    const read = async () => {
      throw failure;
    };

    await expect(readLegacyFile(legacyFileUriOf(ALICE, fileId), read)).rejects.toBe(failure);
  });
});
