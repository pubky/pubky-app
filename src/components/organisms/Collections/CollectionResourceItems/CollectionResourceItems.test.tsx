import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import { COLLECTION_LAYOUT } from '@/config/collections';
import { CollectionResourceItems } from './CollectionResourceItems';

// The card a post shows for a link has its own tests: here only which links get one matters.
vi.mock('@/molecules/PostLinkEmbeds/Providers/Generic/GenericResourcePreview', async () => {
  const { useResourceSurface } = await import('@/molecules/ResourceCard/ResourceSurfaceContext');
  function GenericResourcePreview({ url }: { url: string }) {
    return <div data-testid="preview" data-url={url} data-surface={useResourceSurface()} />;
  }
  return { GenericResourcePreview };
});

const LINKS = ['https://example.com/a', 'https://example.com/b'];

describe('CollectionResourceItems', () => {
  it('shows each external resource as the card a post shows for it, in the collection’s order', () => {
    render(<CollectionResourceItems uris={LINKS} layout={COLLECTION_LAYOUT.CARDS} />);

    expect(screen.getByRole('region', { name: 'External resources in this collection' })).toHaveClass('lg:grid-cols-2');
    expect(screen.getAllByTestId('preview').map((card) => card.dataset.url)).toEqual(LINKS);
    // The card is the item itself: no second surface around it.
    const item = screen.getAllByTestId('collection-resource-item')[0];
    expect(item).toHaveClass('min-w-0');
    expect(item).not.toHaveClass('bg-card');
    expect(item).not.toHaveClass('p-4');
    expect(item).not.toHaveClass('rounded-md');
    // In no post: the card stands on the post card's surface, as the resource page's large card.
    expect(screen.getAllByTestId('preview').map((card) => card.dataset.surface)).toEqual(['card', 'card']);
  });

  it('stacks them in one column in the List layout', () => {
    render(<CollectionResourceItems uris={LINKS} layout={COLLECTION_LAYOUT.LIST} />);

    expect(screen.getByTestId('collection-resource-items')).toHaveClass('grid-cols-1');
    expect(screen.getByTestId('collection-resource-items')).not.toHaveClass('lg:grid-cols-2');
  });

  it('renders nothing for a collection of posts only', () => {
    const { container } = render(<CollectionResourceItems uris={[]} layout={COLLECTION_LAYOUT.CARDS} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('says some items are hidden in the Visual layout (media posts only) instead of showing the cards', () => {
    render(<CollectionResourceItems uris={LINKS} layout={COLLECTION_LAYOUT.VISUAL} />);

    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Some items in this collection are hidden');
  });

  it('previews web links only: any other URI, written by anyone, is a row opening its page on Pubky', () => {
    render(
      <CollectionResourceItems
        uris={['isbn:9780140328721', 'javascript:alert(1)', 'https://example.com/a']}
        layout={COLLECTION_LAYOUT.CARDS}
      />,
    );

    expect(screen.getAllByTestId('preview').map((card) => card.dataset.url)).toEqual(['https://example.com/a']);
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      getResourceRoute('isbn:9780140328721'),
      getResourceRoute('javascript:alert(1)'),
    ]);
    expect(links[0]).toHaveTextContent('9780140328721');
    // A row has no card of its own, so its item keeps the post card's surface.
    const items = screen.getAllByTestId('collection-resource-item');
    expect(items[0]).toHaveClass('bg-card', 'rounded-md', 'p-4');
    expect(items[2]).not.toHaveClass('bg-card');
  });
});
