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

  it('renders the validation message below the pill with alert semantics', () => {
    render(
      <FilterPostsBar
        value="one two three four five"
        onValueChange={vi.fn()}
        validationMessage="Search can contain up to 4 terms"
      />,
    );

    const message = screen.getByRole('alert');
    expect(message).toHaveTextContent('Search can contain up to 4 terms');
    const input = screen.getByRole('textbox', { name: 'Filter posts' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', message.id);
  });

  it('hides the clear button while the input is empty', () => {
    render(<FilterPostsBar value="" onValueChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Clear filter' })).not.toBeInTheDocument();
  });

  it('swaps the search icon for a clear button once the input has text', () => {
    const { container } = render(<FilterPostsBar value="bitcoin" onValueChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Clear filter' })).toBeInTheDocument();
    expect(container.querySelector('svg.lucide-search')).not.toBeInTheDocument();
  });

  it('clears the value and keeps focus in the input when the clear button is pressed', () => {
    const onValueChange = vi.fn();
    render(<FilterPostsBar value="bitcoin" onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));

    expect(onValueChange).toHaveBeenCalledWith('');
    expect(screen.getByRole('textbox', { name: 'Filter posts' })).toHaveFocus();
  });

  it('omits the message and invalid state when the query is fine', () => {
    render(<FilterPostsBar value="bitcoin" onValueChange={vi.fn()} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Filter posts' })).toHaveAttribute('aria-invalid', 'false');
  });
});
