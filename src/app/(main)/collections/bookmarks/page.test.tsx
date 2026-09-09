import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Page from './page';

vi.mock('@/templates/BookmarksCollection/BookmarksCollection', () => ({
  BookmarksCollection: () => <div data-testid="bookmarks-collection-template" />,
}));

describe('/collections/bookmarks page', () => {
  it('renders the dedicated bookmarks collection template', () => {
    render(<Page />);

    expect(screen.getByTestId('bookmarks-collection-template')).toBeInTheDocument();
  });
});
