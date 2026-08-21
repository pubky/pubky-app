import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CONTENT_SEARCH_QUERY_MAX_LENGTH } from '@/config/search';
import { FilterPostsBar } from './FilterPostsBar';

describe('FilterPostsBar', () => {
  it('renders the pill container with the input and search icon', () => {
    const { container } = render(<FilterPostsBar value="" onValueChange={vi.fn()} />);

    expect(screen.getByTestId('filter-posts-bar')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Filter posts' })).toHaveAttribute('placeholder', 'Filter posts');
    expect(container.querySelector('svg.lucide-search')).toBeInTheDocument();
  });

  it('caps the input at the content-search max query length', () => {
    render(<FilterPostsBar value="" onValueChange={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Filter posts' })).toHaveAttribute(
      'maxLength',
      String(CONTENT_SEARCH_QUERY_MAX_LENGTH),
    );
  });

  it('displays the controlled value and reports changes as plain strings', () => {
    const onValueChange = vi.fn();
    render(<FilterPostsBar value="bitcoin" onValueChange={onValueChange} />);

    const input = screen.getByRole('textbox', { name: 'Filter posts' });
    expect(input).toHaveValue('bitcoin');

    fireEvent.change(input, { target: { value: 'bitcoin wallet' } });
    expect(onValueChange).toHaveBeenCalledWith('bitcoin wallet');
  });
});

describe('FilterPostsBar - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<FilterPostsBar value="" onValueChange={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
