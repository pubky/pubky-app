import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterProfileTags } from './FilterProfileTags';

function getTagInputContainer(container: HTMLElement) {
  return container.querySelector('div.relative');
}

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

  it('collapses the whole tags block and removes parked tags from keyboard navigation when disabled', () => {
    const { container } = render(
      <FilterProfileTags selectedTags={['bitcoin']} onTagAdd={vi.fn()} onTagRemove={vi.fn()} disabled />,
    );

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('grid-rows-[0fr]', 'opacity-0', 'pointer-events-none', 'duration-300', 'ease-in-out');
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'bitcoin tag', hidden: true })).toHaveAttribute('tabindex', '-1');
  });

  it('expands the tags block when active', () => {
    const { container } = render(<FilterProfileTags selectedTags={[]} onTagAdd={vi.fn()} onTagRemove={vi.fn()} />);

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('grid-rows-[1fr]', 'opacity-100', 'duration-300', 'ease-in-out');
    expect(wrapper).not.toHaveClass('pointer-events-none');
  });

  it('renders only the current parked tag state while collapsed', () => {
    const { rerender } = render(
      <FilterProfileTags selectedTags={['bitcoin', 'nostr']} onTagAdd={vi.fn()} onTagRemove={vi.fn()} />,
    );

    rerender(<FilterProfileTags selectedTags={[]} onTagAdd={vi.fn()} onTagRemove={vi.fn()} disabled />);

    expect(screen.queryByText('bitcoin')).not.toBeInTheDocument();
    expect(screen.queryByText('nostr')).not.toBeInTheDocument();
  });

  it('keeps the at-limit input the same width as tag chips', () => {
    const { container } = render(
      <FilterProfileTags
        selectedTags={['one', 'two', 'three', 'four', 'five']}
        onTagAdd={vi.fn()}
        onTagRemove={vi.fn()}
      />,
    );

    const tagInputContainer = getTagInputContainer(container);
    expect(tagInputContainer).toHaveClass('w-32');
    expect(tagInputContainer).not.toHaveClass('w-40', 'opacity-60');
  });

  it('hides the emoji selector when at the tag limit', () => {
    render(
      <FilterProfileTags
        selectedTags={['one', 'two', 'three', 'four', 'five']}
        onTagAdd={vi.fn()}
        onTagRemove={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Open emoji picker')).not.toBeInTheDocument();
  });

  it('renders the at-limit placeholder at full opacity', () => {
    render(
      <FilterProfileTags
        selectedTags={['one', 'two', 'three', 'four', 'five']}
        onTagAdd={vi.fn()}
        onTagRemove={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('5 tags max');
    expect(input).toBeDisabled();
    expect(input).toHaveClass('placeholder:text-destructive', 'disabled:opacity-100');
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

  it('uses the configured max tag count in the limit placeholder', () => {
    render(
      <FilterProfileTags selectedTags={['one', 'two', 'three']} onTagAdd={vi.fn()} onTagRemove={vi.fn()} maxTags={3} />,
    );

    expect(screen.getByPlaceholderText('3 tags max')).toBeDisabled();
  });
});
