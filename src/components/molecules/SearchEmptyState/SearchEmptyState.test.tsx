import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchEmptyState } from './SearchEmptyState';

describe('SearchEmptyState', () => {
  it('explains how to search when there are no criteria', () => {
    render(<SearchEmptyState />);

    expect(screen.getByRole('heading', { name: 'Search for posts by tags' })).toBeInTheDocument();
  });
});

describe('SearchEmptyState - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<SearchEmptyState />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
