import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReorderDraftEntry } from '@/hooks/useReorderCollection/useReorderCollection.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { CollectionReorderGrid } from './CollectionReorderGrid';

vi.mock('@/organisms/PostMain/PostMain', () => {
  return {
    PostMain: ({ postId }: { postId: string }) => <div data-testid={`post-${postId}`} />,
  };
});

// Capture the onDragEnd handler the grid passes to DndContext so drop
// behavior can be exercised directly — jsdom has no layout, so simulating a
// real pointer/keyboard drag against dnd-kit's rect measurements is not
// feasible here.
type CapturedDragEnd = (event: { active: { id: string }; over: { id: string } | null }) => void;
const capturedDnd = vi.hoisted(() => ({ onDragEnd: undefined as CapturedDragEnd | undefined }));
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: (props: React.ComponentProps<typeof actual.DndContext>) => {
      capturedDnd.onDragEnd = asOpaque<CapturedDragEnd>(props.onDragEnd);
      return <actual.DndContext {...props} />;
    },
  };
});

const entries: ReorderDraftEntry[] = [
  { uri: 'pubky://author_a/pub/pubky.app/posts/post_a', postId: 'author_a:post_a' },
  { uri: 'pubky://author_b/pub/pubky.app/posts/post_b', postId: 'author_b:post_b' },
];

describe('CollectionReorderGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders one sortable cell per entry, in draft order', () => {
    render(<CollectionReorderGrid entries={entries} onMove={vi.fn()} />);

    const cells = document.querySelectorAll('[data-cy="collection-reorder-card"]');
    expect(cells).toHaveLength(2);
    expect(screen.getByTestId('post-author_a:post_a')).toBeInTheDocument();
    expect(screen.getByTestId('post-author_b:post_b')).toBeInTheDocument();
  });

  it('marks each cell with the design dashed border and wraps the card in an inert overlay', () => {
    render(<CollectionReorderGrid entries={entries} onMove={vi.fn()} />);

    const cell = document.querySelector('[data-cy="collection-reorder-card"]');
    expect(cell).toHaveClass('border-dashed', 'border-foreground/60', 'cursor-grab');

    const inertWrapper = cell?.querySelector('[inert]');
    expect(inertWrapper).not.toBeNull();
    expect(inertWrapper).toHaveClass('pointer-events-none');
  });

  it('renders the missing-post fallback for entries without a composite post id', () => {
    const withUnconvertible: ReorderDraftEntry[] = [
      ...entries,
      { uri: 'https://example.com/not-a-post', postId: null },
    ];
    render(<CollectionReorderGrid entries={withUnconvertible} onMove={vi.fn()} />);

    const cells = document.querySelectorAll('[data-cy="collection-reorder-card"]');
    expect(cells).toHaveLength(3);
    // The unconvertible entry keeps its cell but renders no PostMain.
    expect(screen.queryByTestId('post-null')).not.toBeInTheDocument();
  });

  it('exposes the cells as keyboard-sortable buttons via dnd-kit attributes', () => {
    render(<CollectionReorderGrid entries={entries} onMove={vi.fn()} />);

    const cell = document.querySelector('[data-cy="collection-reorder-card"]');
    expect(cell).toHaveAttribute('role', 'button');
    expect(cell).toHaveAttribute('tabindex', '0');
    expect(cell).toHaveAttribute('aria-roledescription', 'sortable');
  });

  it('disables sorting interactions while saving', () => {
    render(<CollectionReorderGrid entries={entries} onMove={vi.fn()} disabled />);

    const cell = document.querySelector('[data-cy="collection-reorder-card"]');
    expect(cell).toHaveClass('opacity-60');
    expect(cell).toHaveAttribute('aria-disabled', 'true');
  });

  it('reports drops to onMove as (dragged uri, target uri)', () => {
    const onMove = vi.fn();
    render(<CollectionReorderGrid entries={entries} onMove={onMove} />);

    capturedDnd.onDragEnd?.({ active: { id: entries[0].uri }, over: { id: entries[1].uri } });

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(entries[0].uri, entries[1].uri);
  });

  it('ignores drops outside the grid and drops onto the dragged item itself', () => {
    const onMove = vi.fn();
    render(<CollectionReorderGrid entries={entries} onMove={onMove} />);

    capturedDnd.onDragEnd?.({ active: { id: entries[0].uri }, over: null });
    capturedDnd.onDragEnd?.({ active: { id: entries[0].uri }, over: { id: entries[0].uri } });

    expect(onMove).not.toHaveBeenCalled();
  });

  it('matches snapshot', () => {
    const { container } = render(<CollectionReorderGrid entries={entries} onMove={vi.fn()} />);
    normalizeDndIds(container);
    expect(container.firstChild).toMatchSnapshot();
  });
});

// dnd-kit assigns aria ids from a module-global counter (`DndDescribedBy-N`),
// so the raw value depends on how many DndContexts mounted earlier in the
// file. Normalize before snapshotting to keep the baseline order-independent.
function normalizeDndIds(container: HTMLElement) {
  container.querySelectorAll('[aria-describedby^="DndDescribedBy"]').forEach((el) => {
    el.setAttribute('aria-describedby', 'DndDescribedBy');
  });
}
