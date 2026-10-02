import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { getAttachmentAtSlot, toUnlockedMedia } from './unlockedMedia';

describe('toUnlockedMedia', () => {
  beforeEach(() => {
    let created = 0;
    global.URL.createObjectURL = vi.fn(() => `blob:unlocked-${created++}`);
  });

  it('turns each attachment into object-URL media that keeps its slot', () => {
    const media = toUnlockedMedia([
      { id: 'cover', contentType: 'image/png', bytes: new Uint8Array([1]), slot: 0 },
      { id: 'clip', contentType: 'video/mp4', bytes: new Uint8Array([2]), slot: 2 },
    ]);

    expect(media).toEqual([
      { type: 'image/png', name: 'attachment-0', urls: { main: 'blob:unlocked-0', feed: 'blob:unlocked-0' }, slot: 0 },
      { type: 'video/mp4', name: 'attachment-1', urls: { main: 'blob:unlocked-1', feed: undefined }, slot: 2 },
    ]);
  });
});

describe('getAttachmentAtSlot', () => {
  const entry = (name: string, slot?: number): AttachmentConstructed => ({
    type: 'image/png',
    name,
    urls: { main: `blob:${name}` },
    slot,
  });

  it('finds an attachment by its recorded slot, not by its position', () => {
    // Slot 1 was lost: the third attachment now sits second in the list.
    const attachments = [entry('cover', 0), entry('second-image', 2)];

    expect(getAttachmentAtSlot(attachments, 2)?.name).toBe('second-image');
    expect(getAttachmentAtSlot(attachments, 1)).toBeUndefined();
  });

  it('reads a list without slots as index-aligned', () => {
    const attachments = [entry('cover'), entry('inline')];

    expect(getAttachmentAtSlot(attachments, 1)?.name).toBe('inline');
    expect(getAttachmentAtSlot(attachments, 2)).toBeUndefined();
  });

  it('finds nothing in a missing list', () => {
    expect(getAttachmentAtSlot(undefined, 0)).toBeUndefined();
  });
});
