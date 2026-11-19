import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rasterizeSvg } from '@/libs/image/rasterizeSvg';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import type { TUnlockedAttachment } from '@/services/locks/locks.types';
import { getAttachmentAtSlot, toDisplayableAttachments, toUnlockedMedia } from './unlockedMedia';

vi.mock('@/libs/image/rasterizeSvg', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/libs/image/rasterizeSvg')>()),
  rasterizeSvg: vi.fn(),
}));

const svg = (id: string, slot: number): TUnlockedAttachment => ({
  id,
  contentType: 'image/svg+xml',
  bytes: new TextEncoder().encode(`<svg id="${id}"/>`),
  slot,
});

describe('toDisplayableAttachments', () => {
  beforeEach(() => vi.mocked(rasterizeSvg).mockReset());

  it('replaces an SVG with its PNG drawing and leaves other files as they are', async () => {
    const png = new Uint8Array([9]);
    vi.mocked(rasterizeSvg).mockResolvedValue(png);
    const photo: TUnlockedAttachment = { id: 'photo', contentType: 'image/jpeg', bytes: new Uint8Array([1]), slot: 0 };

    const displayable = await toDisplayableAttachments([photo, svg('drawing.svg', 1)]);

    expect(displayable).toEqual([photo, { id: 'drawing.svg', contentType: 'image/png', bytes: png, slot: 1 }]);
  });

  it('drops an SVG the browser cannot draw', async () => {
    vi.mocked(rasterizeSvg)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new Uint8Array([9]));

    const displayable = await toDisplayableAttachments([svg('broken.svg', 0), svg('fine.svg', 1)]);

    expect(displayable.map(({ id }) => id)).toEqual(['fine.svg']);
  });

  it('draws one SVG at a time', async () => {
    let active = 0;
    let peak = 0;
    vi.mocked(rasterizeSvg).mockImplementation(async () => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active--;
      return new Uint8Array([9]);
    });

    await toDisplayableAttachments([svg('a.svg', 0), svg('b.svg', 1), svg('c.svg', 2)]);

    expect(peak).toBe(1);
  });
});

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

  it('never gives an SVG an object URL', () => {
    const media = toUnlockedMedia([svg('drawing.svg', 0)]);

    expect(media).toEqual([]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
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
