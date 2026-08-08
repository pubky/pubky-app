import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReorderDraftEntry } from '@/hooks/useReorderCollection/useReorderCollection.types';
import { CollectionReorderCard } from './CollectionReorderCard';

const mockPostMainProps = vi.hoisted(() => vi.fn());

vi.mock('@/organisms/PostMain/PostMain', () => ({
  PostMain: (props: { postId: string; isNavigable?: boolean }) => {
    mockPostMainProps(props);
    return <div data-testid={`post-${props.postId}`} />;
  },
}));

vi.mock('@/molecules/PostUnavailable/PostUnavailable', () => ({
  PostUnavailable: ({ message }: { message: string }) => <div data-testid="post-unavailable" data-message={message} />,
}));

const ENTRY: ReorderDraftEntry = {
  uri: 'pubky://author_a/pub/pubky.app/posts/post_a',
  postId: 'author_a:post_a',
};

function renderCard(entry: ReorderDraftEntry = ENTRY, disabled = false) {
  // `useSortable` requires DndContext + SortableContext ancestors; the grid
  // provides them in production.
  const wrapper = ({ children }: { children: ReactNode }) => (
    <DndContext>
      <SortableContext items={[entry.uri]}>{children}</SortableContext>
    </DndContext>
  );

  return render(<CollectionReorderCard entry={entry} disabled={disabled} />, { wrapper });
}

describe('CollectionReorderCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a non-navigable PostMain for the entry composite id', () => {
    renderCard();

    expect(screen.getByTestId('post-author_a:post_a')).toBeInTheDocument();
    expect(mockPostMainProps).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'author_a:post_a', isNavigable: false, isReply: false }),
    );
    expect(screen.queryByTestId('post-missing')).not.toBeInTheDocument();
  });

  it('falls back to PostUnavailable when the URI has no composite id', () => {
    renderCard({ uri: 'https://example.com/not-a-post', postId: null });

    expect(screen.getByTestId('post-unavailable')).toBeInTheDocument();
    expect(mockPostMainProps).not.toHaveBeenCalled();
  });

  it('is a keyboard-focusable drag surface with the design dashed border', () => {
    renderCard();

    const cell = document.querySelector('[data-cy="collection-reorder-card"]');
    expect(cell).toHaveClass('border-dashed', 'border-foreground/60', 'cursor-grab', 'select-none');
    expect(cell).toHaveAttribute('role', 'button');
    expect(cell).toHaveAttribute('tabindex', '0');
    expect(cell).toHaveAttribute('aria-roledescription', 'sortable');
  });

  it('makes the card content inert so post actions are unreachable while reordering', () => {
    renderCard();

    const cell = document.querySelector('[data-cy="collection-reorder-card"]');
    const inertWrapper = cell?.querySelector('[inert]');
    expect(inertWrapper).not.toBeNull();
    expect(inertWrapper).toHaveClass('pointer-events-none');
    expect(inertWrapper).toContainElement(screen.getByTestId('post-author_a:post_a'));
  });

  it('reflects the disabled state while a save is in flight', () => {
    renderCard(ENTRY, true);

    const cell = document.querySelector('[data-cy="collection-reorder-card"]');
    expect(cell).toHaveClass('opacity-60', 'cursor-default');
    expect(cell).toHaveAttribute('aria-disabled', 'true');
  });

  it('matches snapshot', () => {
    const { container } = renderCard();
    // dnd-kit assigns aria ids from a module-global counter; normalize so the
    // baseline does not churn when tests are added or reordered in this file.
    container.querySelectorAll('[aria-describedby^="DndDescribedBy"]').forEach((el) => {
      el.setAttribute('aria-describedby', 'DndDescribedBy');
    });
    expect(container.firstChild).toMatchSnapshot();
  });
});
