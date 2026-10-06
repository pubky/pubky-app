import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchResultsEmpty } from './SearchResultsEmpty';

describe('SearchResultsEmpty', () => {
  it('offers Search in All for a narrower reach', () => {
    const onSearchAll = vi.fn();
    render(<SearchResultsEmpty isCollections={false} onSearchAll={onSearchAll} />);

    expect(screen.getByRole('heading', { name: 'No posts match your search' })).toBeInTheDocument();
    expect(screen.getByText('Try searching in All.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search in All' }));
    expect(onSearchAll).toHaveBeenCalledTimes(1);
  });

  it('suggests other terms or filters without an action at All', () => {
    render(<SearchResultsEmpty isCollections={false} />);

    expect(screen.getByText('Try different search terms or filters.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Search in All' })).not.toBeInTheDocument();
  });

  it('names collections when searching the Collections content filter', () => {
    render(<SearchResultsEmpty isCollections onSearchAll={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'No collections match your search' })).toBeInTheDocument();
  });
});

describe('SearchResultsEmpty - Snapshots', () => {
  it('matches snapshot with the Search in All action', () => {
    const { container } = render(<SearchResultsEmpty isCollections={false} onSearchAll={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot without an action', () => {
    const { container } = render(<SearchResultsEmpty isCollections={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for collections', () => {
    const { container } = render(<SearchResultsEmpty isCollections onSearchAll={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
