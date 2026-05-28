import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookmarksEmptyState } from './BookmarksEmptyState';

const defaultProps = {
  title: 'No bookmarks yet',
  description: 'Save posts to Bookmarks and they will appear here.',
};

describe('BookmarksEmptyState', () => {
  it('renders the empty state title and description', () => {
    render(<BookmarksEmptyState {...defaultProps} />);

    expect(screen.getByTestId('bookmarks-empty-state')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No bookmarks yet' })).toBeInTheDocument();
    expect(screen.getByText('Save posts to Bookmarks and they will appear here.')).toBeInTheDocument();
  });
});

describe('BookmarksEmptyState - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<BookmarksEmptyState {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
