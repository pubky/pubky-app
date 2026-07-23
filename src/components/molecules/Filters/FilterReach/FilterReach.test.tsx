import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { REACH } from '@/stores/home/home.types';
import { FilterReach } from './FilterReach';

describe('FilterReach', () => {
  it('renders with default selected tab and proper ARIA attributes', () => {
    render(<FilterReach />);

    expect(screen.getByText('Posts from')).toBeInTheDocument();

    // Check radiogroup exists
    const radiogroup = screen.getByTestId('filter-reach-radiogroup');
    expect(radiogroup).toBeInTheDocument();
    expect(radiogroup).toHaveAttribute('role', 'radiogroup');
    expect(radiogroup).toHaveAttribute('aria-labelledby');
  });

  it('renders the five Figma rings with All selected by default', () => {
    render(<FilterReach />);

    const radiogroup = screen.getByTestId('filter-reach-radiogroup');
    expect(radiogroup).toHaveClass('size-[180px]');
    expect(radiogroup.querySelectorAll('circle')).toHaveLength(5);
    expect(radiogroup.querySelectorAll('circle.stroke-border')).toHaveLength(4);
    expect(radiogroup.querySelector('[data-reach-ring="all"]')).toHaveClass('fill-brand/[0.10]', 'stroke-brand');
    expect(radiogroup.querySelectorAll('circle.fill-transparent')).toHaveLength(4);
    expect(screen.getByTestId('filter-reach-label')).toHaveTextContent('All');
    expect(screen.getByTestId('filter-reach-label')).toHaveClass(
      'text-brand',
      'drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]',
    );
  });

  it('previews a reach in white on hover and restores the selected state on leave', () => {
    render(<FilterReach selectedTab={REACH.FRIENDS} />);

    const following = screen.getByLabelText('Following');
    const radiogroup = screen.getByTestId('filter-reach-radiogroup');
    const followingRing = radiogroup.querySelector('[data-reach-ring="following"]');
    const friendsRing = radiogroup.querySelector('[data-reach-ring="friends"]');
    const label = screen.getByTestId('filter-reach-label');

    fireEvent.mouseEnter(following);

    expect(followingRing).toHaveClass('stroke-foreground');
    expect(friendsRing).toHaveClass('fill-transparent', 'stroke-brand/[0.32]');
    expect(label).toHaveTextContent('Following');
    expect(label).toHaveClass('text-foreground');

    fireEvent.mouseLeave(following);

    expect(followingRing).toHaveClass('stroke-border');
    expect(friendsRing).toHaveClass('fill-brand/[0.10]', 'stroke-brand');
    expect(label).toHaveTextContent('Friends');
    expect(label).toHaveClass('text-brand');
  });

  it('keeps the selected state green when it is hovered', () => {
    render(<FilterReach selectedTab={REACH.FRIENDS} />);

    const friends = screen.getByLabelText('Friends');
    const radiogroup = screen.getByTestId('filter-reach-radiogroup');
    const friendsRing = radiogroup.querySelector('[data-reach-ring="friends"]');
    const label = screen.getByTestId('filter-reach-label');

    fireEvent.mouseEnter(friends);

    expect(friendsRing).toHaveClass('fill-brand/[0.10]', 'stroke-brand');
    expect(label).toHaveTextContent('Friends');
    expect(label).toHaveClass('text-brand');
  });

  it('calls onTabChange when tab is clicked', () => {
    const mockOnTabChange = vi.fn();
    render(<FilterReach onTabChange={mockOnTabChange} />);

    const friendsElement = screen.getByLabelText('Friends');
    fireEvent.click(friendsElement);

    expect(mockOnTabChange).toHaveBeenCalledWith('friends');
  });

  it('handles all tab types correctly', () => {
    const mockOnTabChange = vi.fn();
    render(<FilterReach onTabChange={mockOnTabChange} />);

    const tabs = [
      { value: REACH.ME, label: 'Me' },
      { value: REACH.FRIENDS, label: 'Friends' },
      { value: REACH.FOLLOWING, label: 'Following' },
      { value: REACH.NETWORK, label: 'My Network' },
      { value: REACH.ALL, label: 'All' },
    ];

    tabs.forEach(({ value, label }) => {
      const element = screen.getByLabelText(label);
      fireEvent.click(element);
      expect(mockOnTabChange).toHaveBeenCalledWith(value);
    });
  });

  it.each([
    { label: 'Me', value: REACH.ME },
    { label: 'My Network', value: REACH.NETWORK },
  ])('selects $label and reports the reach change', ({ label, value }) => {
    const mockOnTabChange = vi.fn();
    render(<FilterReach onTabChange={mockOnTabChange} />);

    fireEvent.click(screen.getByLabelText(label));

    const radiogroup = screen.getByTestId('filter-reach-radiogroup');
    expect(radiogroup.querySelector(`[data-reach-ring="${value}"]`)).toHaveClass('fill-brand/[0.10]', 'stroke-brand');
    expect(radiogroup.querySelector('[data-reach-ring="all"]')).toHaveClass('stroke-border');
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('All')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('filter-reach-label')).toHaveTextContent(label);
    expect(mockOnTabChange).toHaveBeenCalledWith(value);

    fireEvent.mouseEnter(screen.getByLabelText('All'));

    expect(radiogroup.querySelector(`[data-reach-ring="${value}"]`)).toHaveClass(
      'fill-transparent',
      'stroke-brand/[0.32]',
    );
    expect(radiogroup.querySelector('[data-reach-ring="all"]')).toHaveClass('stroke-foreground');

    fireEvent.mouseLeave(screen.getByLabelText('All'));

    expect(radiogroup.querySelector(`[data-reach-ring="${value}"]`)).toHaveClass('fill-brand/[0.10]', 'stroke-brand');
  });

  it('has proper ARIA attributes for radio items', () => {
    render(<FilterReach selectedTab={REACH.FOLLOWING} />);

    const allRadio = screen.getByLabelText('All');
    const networkRadio = screen.getByLabelText('My Network');
    const followingRadio = screen.getByLabelText('Following');
    const friendsRadio = screen.getByLabelText('Friends');
    const meRadio = screen.getByLabelText('Me');

    // Check aria-checked
    expect(allRadio).toHaveAttribute('aria-checked', 'false');
    expect(networkRadio).toHaveAttribute('aria-checked', 'false');
    expect(followingRadio).toHaveAttribute('aria-checked', 'true');
    expect(friendsRadio).toHaveAttribute('aria-checked', 'false');
    expect(meRadio).toHaveAttribute('aria-checked', 'false');

    // Check aria-label
    expect(allRadio).toHaveAttribute('aria-label', 'All');
    expect(networkRadio).toHaveAttribute('aria-label', 'My Network');
    expect(followingRadio).toHaveAttribute('aria-label', 'Following');
    expect(friendsRadio).toHaveAttribute('aria-label', 'Friends');
    expect(meRadio).toHaveAttribute('aria-label', 'Me');
  });
  it('renders all items as disabled when disabled prop is true', () => {
    render(<FilterReach disabled />);

    const labels = ['Me', 'Friends', 'Following', 'My Network', 'All'];
    labels.forEach((label) => {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('does not call onTabChange when disabled', () => {
    const mockOnTabChange = vi.fn();
    render(<FilterReach disabled onTabChange={mockOnTabChange} />);

    fireEvent.click(screen.getByLabelText('Me'));
    fireEvent.click(screen.getByLabelText('Following'));
    fireEvent.click(screen.getByLabelText('Friends'));
    fireEvent.click(screen.getByLabelText('My Network'));

    expect(mockOnTabChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('All')).toHaveAttribute('aria-checked', 'true');
  });

  it('items are not disabled by default', () => {
    render(<FilterReach />);

    const labels = ['Me', 'Friends', 'Following', 'My Network', 'All'];
    labels.forEach((label) => {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-disabled', 'true');
    });
  });
});

describe('FilterReach - Keyboard Navigation', () => {
  it('manages tabIndex correctly for keyboard navigation', () => {
    render(<FilterReach selectedTab={REACH.FRIENDS} />);

    const meRadio = screen.getByLabelText('Me');
    const friendsRadio = screen.getByLabelText('Friends');
    const followingRadio = screen.getByLabelText('Following');
    const networkRadio = screen.getByLabelText('My Network');
    const allRadio = screen.getByLabelText('All');

    // Only selected item should have tabIndex 0
    expect(meRadio).toHaveAttribute('tabIndex', '-1');
    expect(friendsRadio).toHaveAttribute('tabIndex', '0');
    expect(followingRadio).toHaveAttribute('tabIndex', '-1');
    expect(networkRadio).toHaveAttribute('tabIndex', '-1');
    expect(allRadio).toHaveAttribute('tabIndex', '-1');
  });

  it('handles keyboard navigation with ArrowDown', () => {
    render(<FilterReach selectedTab={REACH.ALL} />);

    const allRadio = screen.getByLabelText('All');
    const meRadio = screen.getByLabelText('Me');

    allRadio.focus();
    fireEvent.keyDown(allRadio, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(meRadio);
  });

  it('handles keyboard navigation with ArrowUp', () => {
    render(<FilterReach selectedTab={REACH.FOLLOWING} />);

    const friendsRadio = screen.getByLabelText('Friends');
    const followingRadio = screen.getByLabelText('Following');

    followingRadio.focus();
    fireEvent.keyDown(followingRadio, { key: 'ArrowUp' });

    expect(document.activeElement).toBe(friendsRadio);
  });

  it('wraps keyboard navigation from last to first with ArrowDown', () => {
    render(<FilterReach selectedTab={REACH.ALL} />);

    const allRadio = screen.getByLabelText('All');
    const meRadio = screen.getByLabelText('Me');

    allRadio.focus();
    fireEvent.keyDown(allRadio, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(meRadio);
  });

  it('wraps keyboard navigation from first to last with ArrowUp', () => {
    render(<FilterReach selectedTab={REACH.ALL} />);

    const allRadio = screen.getByLabelText('All');
    const meRadio = screen.getByLabelText('Me');

    meRadio.focus();
    fireEvent.keyDown(meRadio, { key: 'ArrowUp' });

    expect(document.activeElement).toBe(allRadio);
  });

  it('handles Home key to jump to first option', () => {
    render(<FilterReach selectedTab={REACH.FRIENDS} />);

    const friendsRadio = screen.getByLabelText('Friends');
    const meRadio = screen.getByLabelText('Me');

    friendsRadio.focus();
    fireEvent.keyDown(friendsRadio, { key: 'Home' });

    expect(document.activeElement).toBe(meRadio);
  });

  it('handles End key to jump to last option', () => {
    render(<FilterReach selectedTab={REACH.ALL} />);

    const allRadio = screen.getByLabelText('All');
    const meRadio = screen.getByLabelText('Me');

    meRadio.focus();
    fireEvent.keyDown(meRadio, { key: 'End' });

    expect(document.activeElement).toBe(allRadio);
  });

  it('handles selection with Space key', () => {
    const mockOnTabChange = vi.fn();
    render(<FilterReach selectedTab={REACH.ALL} onTabChange={mockOnTabChange} />);

    const followingRadio = screen.getByLabelText('Following');

    followingRadio.focus();
    fireEvent.keyDown(followingRadio, { key: ' ' });

    expect(mockOnTabChange).toHaveBeenCalledWith('following');
  });

  it('handles selection with Enter key', () => {
    const mockOnTabChange = vi.fn();
    render(<FilterReach selectedTab={REACH.ALL} onTabChange={mockOnTabChange} />);

    const friendsRadio = screen.getByLabelText('Friends');

    friendsRadio.focus();
    fireEvent.keyDown(friendsRadio, { key: 'Enter' });

    expect(mockOnTabChange).toHaveBeenCalledWith('friends');
  });

  it('selects Network with the keyboard and reports the reach change', () => {
    const mockOnTabChange = vi.fn();
    const { rerender } = render(<FilterReach selectedTab={REACH.ALL} onTabChange={mockOnTabChange} />);

    const networkRadio = screen.getByLabelText('My Network');
    networkRadio.focus();
    fireEvent.keyDown(networkRadio, { key: 'Enter' });

    expect(mockOnTabChange).toHaveBeenCalledWith(REACH.NETWORK);

    rerender(<FilterReach selectedTab={REACH.NETWORK} onTabChange={mockOnTabChange} />);

    expect(networkRadio).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('filter-reach-label')).toHaveTextContent('My Network');
  });

  it('handles ArrowRight key like ArrowDown', () => {
    render(<FilterReach selectedTab={REACH.ALL} />);

    const allRadio = screen.getByLabelText('All');
    const meRadio = screen.getByLabelText('Me');

    allRadio.focus();
    fireEvent.keyDown(allRadio, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(meRadio);
  });

  it('handles ArrowLeft key like ArrowUp', () => {
    render(<FilterReach selectedTab={REACH.FOLLOWING} />);

    const friendsRadio = screen.getByLabelText('Friends');
    const followingRadio = screen.getByLabelText('Following');

    followingRadio.focus();
    fireEvent.keyDown(followingRadio, { key: 'ArrowLeft' });

    expect(document.activeElement).toBe(friendsRadio);
  });
});

describe('FilterReach - Controlled/Uncontrolled', () => {
  it('works as controlled component', () => {
    const mockOnTabChange = vi.fn();
    const { rerender } = render(<FilterReach selectedTab={REACH.ALL} onTabChange={mockOnTabChange} />);

    const followingRadio = screen.getByLabelText('Following');
    fireEvent.click(followingRadio);

    expect(mockOnTabChange).toHaveBeenCalledWith('following');

    // In controlled mode, parent should update the prop
    rerender(<FilterReach selectedTab={REACH.FOLLOWING} onTabChange={mockOnTabChange} />);

    expect(screen.getByLabelText('Following')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('All')).toHaveAttribute('aria-checked', 'false');
  });

  it('updates a controlled ME selection when the feed value changes', () => {
    const { rerender } = render(<FilterReach selectedTab={REACH.ME} />);

    expect(screen.getByLabelText('Me')).toHaveAttribute('aria-checked', 'true');

    rerender(<FilterReach selectedTab={REACH.FOLLOWING} />);
    expect(screen.getByLabelText('Following')).toHaveAttribute('aria-checked', 'true');

    rerender(<FilterReach selectedTab={REACH.ALL} />);
    expect(screen.getByLabelText('All')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Me')).toHaveAttribute('aria-checked', 'false');
  });

  it('works as uncontrolled component with defaultSelectedTab', () => {
    render(<FilterReach defaultSelectedTab={REACH.FRIENDS} />);

    // Should start with Friends selected
    expect(screen.getByLabelText('Friends')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('All')).toHaveAttribute('aria-checked', 'false');

    // Click should update internal state
    const followingRadio = screen.getByLabelText('Following');
    fireEvent.click(followingRadio);

    expect(screen.getByLabelText('Following')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Friends')).toHaveAttribute('aria-checked', 'false');
  });

  it('ignores defaultSelectedTab when controlled', () => {
    render(<FilterReach selectedTab={REACH.FRIENDS} defaultSelectedTab={REACH.ALL} />);

    // Should use controlled value, not default
    expect(screen.getByLabelText('Friends')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('All')).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onTabChange in uncontrolled mode', () => {
    const mockOnTabChange = vi.fn();
    render(<FilterReach defaultSelectedTab={REACH.ALL} onTabChange={mockOnTabChange} />);

    const followingRadio = screen.getByLabelText('Following');
    fireEvent.click(followingRadio);

    expect(mockOnTabChange).toHaveBeenCalledWith('following');
    // Should also update internal state
    expect(screen.getByLabelText('Following')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('FilterReach - Performance', () => {
  it('does not recreate handlers on re-render when props are stable', () => {
    const mockOnTabChange = vi.fn();
    const { rerender } = render(<FilterReach selectedTab={REACH.ALL} onTabChange={mockOnTabChange} />);

    const followingRadio = screen.getByLabelText('Following');
    const initialOnClick = followingRadio.onclick;

    // Re-render with same props
    rerender(<FilterReach selectedTab={REACH.ALL} onTabChange={mockOnTabChange} />);

    // Handler reference should be stable due to useCallback
    expect(followingRadio.onclick).toBe(initialOnClick);
  });
});

describe('FilterReach - Snapshots', () => {
  it('matches snapshot with default props (All selected)', () => {
    const { container } = render(<FilterReach />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with All selected tab', () => {
    const { container } = render(<FilterReach selectedTab={REACH.ALL} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Following selected', () => {
    const { container } = render(<FilterReach selectedTab={REACH.FOLLOWING} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Friends selected', () => {
    const { container } = render(<FilterReach selectedTab={REACH.FRIENDS} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot in uncontrolled mode with defaultSelectedTab', () => {
    const { container } = render(<FilterReach defaultSelectedTab={REACH.FRIENDS} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with disabled state', () => {
    const { container } = render(<FilterReach disabled />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
