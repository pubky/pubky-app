import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchHeader } from './SearchHeader';

describe('SearchHeader', () => {
  it('shows the full-text query in preference to tag criteria', () => {
    render(<SearchHeader tags={['ignored-tag']} query="bitcoin wallet" />);

    expect(screen.getByRole('heading', { name: 'Results for: bitcoin wallet' })).toBeInTheDocument();
  });

  it('keeps existing tag criteria and renders nothing without search criteria', () => {
    const { rerender } = render(<SearchHeader tags={['bitcoin', 'design']} />);
    expect(screen.getByRole('heading', { name: 'Results for: bitcoin, design' })).toBeInTheDocument();

    rerender(<SearchHeader tags={[]} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
