import { describe, expect, it } from 'vitest';
import { LOCK_ATTACHMENT_MAX_FILES, LOCK_ATTACHMENT_MAX_SIZE } from '@/config/posts';
import { areLockAttachmentsWithinLimit, hasSvgAttachment } from './lockAttachments';

const fileOfSize = (size: number) => {
  const file = new File(['x'], 'image.png', { type: 'image/png' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('areLockAttachmentsWithinLimit', () => {
  it('accepts no files', () => {
    expect(areLockAttachmentsWithinLimit([])).toBe(true);
  });

  it('accepts the maximum number of files', () => {
    const files = Array.from({ length: LOCK_ATTACHMENT_MAX_FILES }, () => fileOfSize(1));

    expect(areLockAttachmentsWithinLimit(files)).toBe(true);
  });

  it('rejects one file more than the maximum', () => {
    const files = Array.from({ length: LOCK_ATTACHMENT_MAX_FILES + 1 }, () => fileOfSize(1));

    expect(areLockAttachmentsWithinLimit(files)).toBe(false);
  });

  it('accepts a file of exactly the maximum size', () => {
    expect(areLockAttachmentsWithinLimit([fileOfSize(LOCK_ATTACHMENT_MAX_SIZE)])).toBe(true);
  });

  it('rejects a file one byte over, which 10 MiB would have let through', () => {
    expect(areLockAttachmentsWithinLimit([fileOfSize(LOCK_ATTACHMENT_MAX_SIZE + 1)])).toBe(false);
    expect(LOCK_ATTACHMENT_MAX_SIZE).toBeLessThan(10 * 1024 * 1024);
  });

  it('rejects the set when only one file is too large', () => {
    expect(areLockAttachmentsWithinLimit([fileOfSize(1), fileOfSize(LOCK_ATTACHMENT_MAX_SIZE + 1)])).toBe(false);
  });
});

describe('hasSvgAttachment', () => {
  const png = new File(['x'], 'image.png', { type: 'image/png' });
  const svg = new File(['<svg />'], 'image.svg', { type: 'image/svg+xml' });

  it('finds an SVG among other files', () => {
    expect(hasSvgAttachment([png, svg])).toBe(true);
  });

  it('finds none in files of other types, or in no files', () => {
    expect(hasSvgAttachment([png])).toBe(false);
    expect(hasSvgAttachment([])).toBe(false);
  });
});
