import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterProfileTags } from './FilterProfileTags';

describe('FilterProfileTags', () => {
  it('adds a normalized profile tag from the input', async () => {
    const onTagAdd = vi.fn();

    render(<FilterProfileTags selectedTags={[]} onTagAdd={onTagAdd} onTagRemove={vi.fn()} />);

    const input = screen.getByPlaceholderText('profile tag');
    fireEvent.change(input, { target: { value: 'Bitcoin' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(onTagAdd).toHaveBeenCalledWith('bitcoin');
    });
  });

  it('renders selected tags in a removable stack', () => {
    const onTagRemove = vi.fn();

    render(<FilterProfileTags selectedTags={['bitcoin', 'nostr']} onTagAdd={vi.fn()} onTagRemove={onTagRemove} />);

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
    expect(screen.getByText('nostr')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remove bitcoin tag'));

    expect(onTagRemove).toHaveBeenCalledWith('bitcoin');
  });

  it('shows the shared tag emoji selector', () => {
    render(<FilterProfileTags selectedTags={[]} onTagAdd={vi.fn()} onTagRemove={vi.fn()} />);

    expect(screen.getByLabelText('Open emoji picker')).toBeInTheDocument();
  });

  it('disables the profile tag input when disabled', () => {
    render(<FilterProfileTags selectedTags={[]} onTagAdd={vi.fn()} onTagRemove={vi.fn()} disabled />);

    expect(screen.getByPlaceholderText('profile tag')).toBeDisabled();
  });

  it('prevents adding more than five tags', () => {
    const onTagAdd = vi.fn();

    render(
      <FilterProfileTags
        selectedTags={['one', 'two', 'three', 'four', 'five']}
        onTagAdd={onTagAdd}
        onTagRemove={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText('5 tags max')).toBeDisabled();
  });
});
