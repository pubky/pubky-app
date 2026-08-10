import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CollectionItemsEmpty } from './CollectionItemsEmpty';

describe('CollectionItemsEmpty', () => {
  it('renders the collection empty copy', () => {
    render(<CollectionItemsEmpty />);

    expect(screen.getByText('This collection is empty.')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="collection-items-empty"]')).toBeInTheDocument();
  });

  it('uses a custom data-cy value when provided', () => {
    render(<CollectionItemsEmpty dataCy="bookmarks-items-empty" />);

    expect(document.querySelector('[data-cy="bookmarks-items-empty"]')).toBeInTheDocument();
  });
});

describe('CollectionItemsEmpty - Snapshots', () => {
  it('matches the snapshot', () => {
    const { container } = render(<CollectionItemsEmpty />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
