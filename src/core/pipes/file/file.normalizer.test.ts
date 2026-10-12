import { buildFile, createMediaHasher } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { FileNormalizer } from '@/pipes/file/file.normalizer';
import { TEST_PUBKY } from '../pipes.test-utils';

const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

// jsdom's Blob has no `stream()`, which `hashMedia` reads, so the id is hashed from the bytes.
const mediaIdOf = (bytes: Uint8Array) => {
  const hasher = createMediaHasher();
  hasher.update(bytes);
  return hasher.id();
};

const toAttachment = async (file: File, blobData?: Uint8Array) => {
  const data = blobData ?? new Uint8Array(await file.arrayBuffer());
  return FileNormalizer.toFileAttachment({ file, mediaId: mediaIdOf(data), blobData: data, pubky: TEST_PUBKY.USER_1 });
};

describe('FileNormalizer', () => {
  it('names the media by the hash of its bytes, with the extension of its type', async () => {
    const file = new File([bytes], 'cat.png', { type: 'image/png' });
    const result = await toAttachment(file);

    expect(result.media).toEqual(buildFile(TEST_PUBKY.USER_1, { bytes, type: 'image/png' }));
    expect(result.media.path).toMatch(/^\/pub\/social\/v1\/files\/[0-9A-Z]+\.png$/);
    expect(result).toMatchObject({ bytes, name: 'cat.png', contentType: 'image/png' });
  });

  it('gives identical bytes one URL whatever the file is called', async () => {
    const a = await toAttachment(new File([bytes], 'a.png', { type: 'image/png' }));
    const b = await toAttachment(new File([bytes], 'b.png', { type: 'image/png' }));
    expect(a.media.url).toBe(b.media.url);
  });

  it('maps a type the data model does not know to .bin', async () => {
    const result = await toAttachment(new File([bytes], 'clip.heic', { type: 'image/heic' }));
    expect(result.media.path.endsWith('.bin')).toBe(true);
  });

  it('refuses empty bytes', async () => {
    const file = new File([], 'empty.png', { type: 'image/png' });
    await expect(toAttachment(file, new Uint8Array())).rejects.toBeInstanceOf(AppError);
    await expect(toAttachment(file, new Uint8Array())).rejects.toMatchObject({
      code: ValidationErrorCode.INVALID_INPUT,
    });
  });

  it('refuses an id that is no media hash', () => {
    const file = new File([bytes], 'cat.png', { type: 'image/png' });
    expect(() =>
      FileNormalizer.toFileAttachment({ file, mediaId: 'not-a-hash', blobData: bytes, pubky: TEST_PUBKY.USER_1 }),
    ).toThrow(AppError);
  });
});
