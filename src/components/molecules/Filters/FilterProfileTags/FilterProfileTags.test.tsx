import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { REACH } from '@/stores/home/home.types';
import { FilterProfileTags } from './FilterProfileTags';

const mockUseIsMobile = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: mockUseIsMobile,
}));

function getTagInputContainer(container: HTMLElement) {
  return container.querySelector('div.relative');
}

function renderWithTooltip(ui: ReactElement) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

describe('FilterProfileTags', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReset();
    mockUseIsMobile.mockReturnValue(false);
  });

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

  it('collapses the whole tags block when disabled', () => {
    const { container } = render(
      <FilterProfileTags selectedTags={[]} onTagAdd={vi.fn()} onTagRemove={vi.fn()} disabled />,
    );

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('grid-rows-[0fr]', 'opacity-0', 'pointer-events-none', 'duration-300', 'ease-in-out');
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
  });

  it('expands the tags block when active', () => {
    const { container } = render(<FilterProfileTags selectedTags={[]} onTagAdd={vi.fn()} onTagRemove={vi.fn()} />);

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('grid-rows-[1fr]', 'opacity-100', 'duration-300', 'ease-in-out');
    expect(wrapper).not.toHaveClass('pointer-events-none');
  });

  it('keeps rendering the last selected tags while disabled so they collapse with the block', () => {
    const { rerender } = render(
      <FilterProfileTags selectedTags={['bitcoin', 'nostr']} onTagAdd={vi.fn()} onTagRemove={vi.fn()} />,
    );

    // Parent clears tags and disables at the same time (e.g. switching reach to All/Me).
    rerender(<FilterProfileTags selectedTags={[]} onTagAdd={vi.fn()} onTagRemove={vi.fn()} disabled />);

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
    expect(screen.getByText('nostr')).toBeInTheDocument();

    // Re-enabling syncs back to the real (cleared) selection.
    rerender(<FilterProfileTags selectedTags={[]} onTagAdd={vi.fn()} onTagRemove={vi.fn()} />);

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

  it.each([
    {
      reach: REACH.NETWORK,
      copy: 'Show posts from people my network tagged as…',
    },
    {
      reach: REACH.FOLLOWING,
      copy: 'Show posts from people I follow tagged as…',
    },
    {
      reach: REACH.FRIENDS,
      // Honest V1 copy: Friends + profile tags uses the same depth-1 trust set as Following.
      copy: 'Show posts from people I follow tagged as…',
    },
    {
      reach: REACH.ME,
      copy: 'Show posts from people I tagged as…',
    },
  ] as const)('shows a desktop tooltip for $reach reach after hover', async ({ reach, copy }) => {
    const user = userEvent.setup();

    renderWithTooltip(<FilterProfileTags selectedTags={[]} onTagAdd={vi.fn()} onTagRemove={vi.fn()} reach={reach} />);

    await user.hover(screen.getByPlaceholderText('profile tag'));

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent(copy);
    });
  });

  it('does not show a tooltip for All reach', async () => {
    const user = userEvent.setup();

    renderWithTooltip(
      <FilterProfileTags selectedTags={[]} onTagAdd={vi.fn()} onTagRemove={vi.fn()} reach={REACH.ALL} />,
    );

    await user.hover(screen.getByPlaceholderText('profile tag'));

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('does not show a tooltip when reach is omitted', async () => {
    const user = userEvent.setup();

    renderWithTooltip(<FilterProfileTags selectedTags={[]} onTagAdd={vi.fn()} onTagRemove={vi.fn()} />);

    await user.hover(screen.getByPlaceholderText('profile tag'));

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('does not show a tooltip on mobile', async () => {
    mockUseIsMobile.mockReturnValue(true);
    const user = userEvent.setup();

    renderWithTooltip(
      <FilterProfileTags selectedTags={[]} onTagAdd={vi.fn()} onTagRemove={vi.fn()} reach={REACH.NETWORK} />,
    );

    await user.hover(screen.getByPlaceholderText('profile tag'));

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
