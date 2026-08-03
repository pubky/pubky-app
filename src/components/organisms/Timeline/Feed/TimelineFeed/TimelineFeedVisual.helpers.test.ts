import { describe, expect, it } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { CONTENT } from '@/stores/home/home.types';
import {
  appendVisualTrailingCell,
  composeVisualRows,
  getVisualPendingOverflowFallbackIds,
  resolvePreferredVisualTileSize,
  resolveVisualFeedContent,
  resolveVisualTileSizeOptions,
} from './TimelineFeedVisual.helpers';
import type { VisualRow, VisualTile } from './TimelineFeedVisual.types';

function createTile(id: string, preferredSize: NonNullable<VisualTile['preferredSize']>): VisualTile {
  return {
    id,
    postId: `post:${id}`,
    attachmentId: id,
    attachmentName: id,
    contentType: 'image/jpeg',
    mediaKind: 'image',
    previewSrc: `/preview/${id}.jpg`,
    mainSrc: `/main/${id}.jpg`,
    preferredSize,
    probeState: 'ready',
    isBlurred: false,
    content: '',
    indexedAt: 0,
  };
}

describe('resolvePreferredVisualTileSize', () => {
  it('returns medium for mid-range aspect ratios', () => {
    expect(resolvePreferredVisualTileSize('tile:mid', 1000, 800)).toBe('medium');
  });

  it('treats ratios between 1:1 and 4:3 as medium only', () => {
    expect(resolveVisualTileSizeOptions('tile:mid-only', 5, 4)).toEqual(['medium']);
  });

  it('is deterministic for tall media', () => {
    const first = resolvePreferredVisualTileSize('tile:tall', 600, 1000);
    const second = resolvePreferredVisualTileSize('tile:tall', 600, 1000);

    expect(first).toBe(second);
    expect(['square', 'medium']).toContain(first);
  });

  it('keeps 16:9 media wide-preferred while still medium-capable', () => {
    const options = resolveVisualTileSizeOptions('tile:wide', 1920, 900);
    const preferred = resolvePreferredVisualTileSize('tile:wide', 1920, 900);

    expect(options).toEqual(['wide', 'medium']);
    expect(preferred).toBe('wide');
  });

  it('treats 4:3 media as wide-capable instead of medium-only', () => {
    const options = resolveVisualTileSizeOptions('tile:four-three', 4, 3);

    expect(options).toBeDefined();
    expect(options).toEqual(expect.arrayContaining(['wide', 'medium']));
  });

  it('treats square images as square-capable instead of medium-only', () => {
    const options = resolveVisualTileSizeOptions('tile:squareish', 1000, 1000);

    expect(options).toBeDefined();
    expect(options).toEqual(expect.arrayContaining(['square', 'medium']));
  });
});

describe('composeVisualRows', () => {
  it('keeps square + wide rows', () => {
    const result = composeVisualRows([createTile('a', 'square'), createTile('b', 'wide')], false);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cells.map((cell) => cell.size)).toEqual(['square', 'wide']);
    expect(result.tail).toHaveLength(0);
  });

  it('keeps wide + square rows', () => {
    const result = composeVisualRows([createTile('a', 'wide'), createTile('b', 'square')], false);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cells.map((cell) => cell.size)).toEqual(['wide', 'square']);
  });

  it('builds triple square rows when all three tiles fit', () => {
    const result = composeVisualRows(
      [createTile('a', 'square'), createTile('b', 'square'), createTile('c', 'square')],
      false,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cells.map((cell) => cell.size)).toEqual(['square', 'square', 'square']);
    expect(result.tail).toHaveLength(0);
  });

  it('uses eligible fallback sizes to prefer a varied square + wide row over medium + medium', () => {
    const result = composeVisualRows(
      [
        {
          ...createTile('a', 'medium'),
          sizeOptions: ['medium', 'square'],
        },
        {
          ...createTile('b', 'medium'),
          sizeOptions: ['medium', 'wide'],
        },
      ],
      false,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cells.map((cell) => cell.size)).toEqual(['square', 'wide']);
  });

  it('buffers a two-square tail until more tiles arrive', () => {
    const result = composeVisualRows([createTile('a', 'square'), createTile('b', 'square')], false);

    expect(result.rows).toHaveLength(0);
    expect(result.tail.map((tile) => tile.id)).toEqual(['a', 'b']);
  });

  it('degrades a two-tile tail to medium + medium at end of stream', () => {
    const result = composeVisualRows([createTile('a', 'square'), createTile('b', 'square')], true);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cells.map((cell) => cell.size)).toEqual(['medium', 'medium']);
    expect(result.tail).toHaveLength(0);
  });

  it('renders a spacer-backed final row for a single leftover tile', () => {
    const result = composeVisualRows([createTile('a', 'medium')], true);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cells.map((cell) => cell.isSpacer ?? false)).toEqual([false, true]);
    expect(result.rows[0].cells.map((cell) => cell.size)).toEqual(['medium', 'medium']);
  });
});

describe('appendVisualTrailingCell', () => {
  it('reuses the last-row spacer as the trailing slot with its size preserved', () => {
    const { rows } = composeVisualRows([createTile('a', 'medium')], true);

    const result = appendVisualTrailingCell(rows);

    expect(result).toHaveLength(1);
    expect(result[0].cells.map((cell) => cell.size)).toEqual(['medium', 'medium']);
    expect(result[0].cells[0]).toEqual(rows[0].cells[0]);
    expect(result[0].cells[1]).toEqual({
      key: 'spacer:a',
      size: 'medium',
      isSpacer: false,
      isTrailingSlot: true,
    });
  });

  it('leaves earlier rows, sibling cells, and the input array untouched when replacing a spacer', () => {
    const fullRow: VisualRow = {
      key: 'row:full',
      cells: [
        { key: 'cell:a', size: 'square', tile: { ...createTile('a', 'square'), rowSize: 'square' } },
        { key: 'cell:b', size: 'wide', tile: { ...createTile('b', 'wide'), rowSize: 'wide' } },
      ],
    };
    const spacerRow: VisualRow = {
      key: 'row:c:spacer',
      cells: [
        { key: 'cell:c', size: 'medium', tile: { ...createTile('c', 'medium'), rowSize: 'medium' } },
        { key: 'spacer:c', size: 'medium', isSpacer: true },
      ],
    };
    const rows = [fullRow, spacerRow];

    const result = appendVisualTrailingCell(rows);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(fullRow);
    expect(result[1]).not.toBe(spacerRow);
    expect(result[1].cells[0]).toBe(spacerRow.cells[0]);
    expect(result[1].cells[1]).toEqual({
      key: 'spacer:c',
      size: 'medium',
      isSpacer: false,
      isTrailingSlot: true,
    });
    expect(rows).toHaveLength(2);
    expect(spacerRow.cells[1]).toEqual({ key: 'spacer:c', size: 'medium', isSpacer: true });
  });

  it('appends a dedicated medium trailing row when the last row has no spacer', () => {
    const { rows } = composeVisualRows([createTile('a', 'square'), createTile('b', 'wide')], false);

    const result = appendVisualTrailingCell(rows);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(rows[0]);
    expect(result[1]).toEqual({
      key: 'row:visual-trailing',
      cells: [{ key: 'cell:visual-trailing', size: 'medium', isTrailingSlot: true }],
    });
    expect(rows).toHaveLength(1);
  });

  it('returns only the trailing row for an empty mosaic', () => {
    expect(appendVisualTrailingCell([])).toEqual([
      {
        key: 'row:visual-trailing',
        cells: [{ key: 'cell:visual-trailing', size: 'medium', isTrailingSlot: true }],
      },
    ]);
  });
});

describe('resolveVisualFeedContent', () => {
  it('coerces unsupported content to all for interactive visual feeds', () => {
    expect(
      resolveVisualFeedContent({
        content: CONTENT.SHORT,
        variant: TIMELINE_FEED_VARIANT.HOME,
        isVisualActive: true,
      }),
    ).toBe(CONTENT.ALL);
  });

  it('coerces collections content to all for interactive visual feeds', () => {
    expect(
      resolveVisualFeedContent({
        content: CONTENT.COLLECTIONS,
        variant: TIMELINE_FEED_VARIANT.HOME,
        isVisualActive: true,
      }),
    ).toBe(CONTENT.ALL);
  });

  it('leaves read-only custom feed content untouched in visual mode', () => {
    expect(
      resolveVisualFeedContent({
        content: CONTENT.SHORT,
        variant: TIMELINE_FEED_VARIANT.CUSTOM,
        isVisualActive: true,
      }),
    ).toBe(CONTENT.SHORT);
  });
});

describe('getVisualPendingOverflowFallbackIds', () => {
  it('caps the pending suffix by degrading the oldest unresolved tile first', () => {
    const fallbackIds = getVisualPendingOverflowFallbackIds([
      { id: 'a', preferredSize: 'medium' },
      { id: 'b', preferredSize: undefined },
      { id: 'c', preferredSize: 'medium' },
      { id: 'd', preferredSize: undefined },
      { id: 'e', preferredSize: 'medium' },
      { id: 'f', preferredSize: 'medium' },
    ]);

    expect(fallbackIds).toEqual(['b']);
  });

  it('degrades multiple unresolved tiles when needed to keep only a bounded tail', () => {
    const fallbackIds = getVisualPendingOverflowFallbackIds([
      { id: 'a', preferredSize: undefined },
      { id: 'b', preferredSize: 'medium' },
      { id: 'c', preferredSize: undefined },
      { id: 'd', preferredSize: 'medium' },
      { id: 'e', preferredSize: 'medium' },
      { id: 'f', preferredSize: 'medium' },
    ]);

    expect(fallbackIds).toEqual(['a', 'c']);
  });
});
