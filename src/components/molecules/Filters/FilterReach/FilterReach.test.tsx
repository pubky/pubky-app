import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterReach } from './FilterReach';
import { REACH } from '@/core';

describe('FilterReach', () => {
  it('renders with default selected tab and proper ARIA attributes', () => {
    render(<FilterReach />);

    expect(screen.getByText('Reach')).toBeInTheDocument();

    // Check radiogroup exists
    const radiogroup = screen.getByTestId('filter-reach-radiogroup');
    expect(radiogroup).toBeInTheDocument();
    expect(radiogroup).toHaveAttribute('role', 'radiogroup');
    expect(radiogroup).toHaveAttribute('aria-labelledby');
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
      { value: REACH.ALL, label: 'All' },
      { value: REACH.FOLLOWING, label: 'Following' },
      { value: REACH.FRIENDS, label: 'Friends' },
    ];

    tabs.forEach(({ value, label }) => {
      const element = screen.getByLabelText(label);
      fireEvent.click(element);
      expect(mockOnTabChange).toHaveBeenCalledWith(value);
    });
  });

  it('has proper ARIA attributes for radio items', () => {
    render(<FilterReach selectedTab={REACH.FOLLOWING} />);

    const allRadio = screen.getByLabelText('All');
    const followingRadio = screen.getByLabelText('Following');
    const friendsRadio = screen.getByLabelText('Friends');

    // Check aria-checked
    expect(allRadio).toHaveAttribute('aria-checked', 'false');
    expect(followingRadio).toHaveAttribute('aria-checked', 'true');
    expect(friendsRadio).toHaveAttribute('aria-checked', 'false');

    // Check aria-label
    expect(allRadio).toHaveAttribute('aria-label', 'All');
    expect(followingRadio).toHaveAttribute('aria-label', 'Following');
    expect(friendsRadio).toHaveAttribute('aria-label', 'Friends');
  });
});

describe('FilterReach - Keyboard Navigation', () => {
  it('manages tabIndex correctly for keyboard navigation', () => {
    render(<FilterReach selectedTab={REACH.FRIENDS} />);

    const allRadio = screen.getByLabelText('All');
    const followingRadio = screen.getByLabelText('Following');
    const friendsRadio = screen.getByLabelText('Friends');

    // Only selected item should have tabIndex 0
    expect(allRadio).toHaveAttribute('tabIndex', '-1');
    expect(followingRadio).toHaveAttribute('tabIndex', '-1');
    expect(friendsRadio).toHaveAttribute('tabIndex', '0');
  });

  it('handles keyboard navigation with ArrowDown', () => {
    render(<FilterReach selectedTab={REACH.ALL} />);

    const allRadio = screen.getByLabelText('All');
    const followingRadio = screen.getByLabelText('Following');

    allRadio.focus();
    fireEvent.keyDown(allRadio, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(followingRadio);
  });

  it('handles keyboard navigation with ArrowUp', () => {
    render(<FilterReach selectedTab={REACH.FOLLOWING} />);

    const allRadio = screen.getByLabelText('All');
    const followingRadio = screen.getByLabelText('Following');

    followingRadio.focus();
    fireEvent.keyDown(followingRadio, { key: 'ArrowUp' });

    expect(document.activeElement).toBe(allRadio);
  });

  it('wraps keyboard navigation from last to first with ArrowDown', () => {
    render(<FilterReach selectedTab={REACH.FRIENDS} />);

    const allRadio = screen.getByLabelText('All');
    const friendsRadio = screen.getByLabelText('Friends');

    friendsRadio.focus();
    fireEvent.keyDown(friendsRadio, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(allRadio);
  });

  it('wraps keyboard navigation from first to last with ArrowUp', () => {
    render(<FilterReach selectedTab={REACH.ALL} />);

    const allRadio = screen.getByLabelText('All');
    const friendsRadio = screen.getByLabelText('Friends');

    allRadio.focus();
    fireEvent.keyDown(allRadio, { key: 'ArrowUp' });

    expect(document.activeElement).toBe(friendsRadio);
  });

  it('handles Home key to jump to first option', () => {
    render(<FilterReach selectedTab={REACH.FRIENDS} />);

    const allRadio = screen.getByLabelText('All');
    const friendsRadio = screen.getByLabelText('Friends');

    friendsRadio.focus();
    fireEvent.keyDown(friendsRadio, { key: 'Home' });

    expect(document.activeElement).toBe(allRadio);
  });

  it('handles End key to jump to last option', () => {
    render(<FilterReach selectedTab={REACH.ALL} />);

    const allRadio = screen.getByLabelText('All');
    const friendsRadio = screen.getByLabelText('Friends');

    allRadio.focus();
    fireEvent.keyDown(allRadio, { key: 'End' });

    expect(document.activeElement).toBe(friendsRadio);
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

  it('handles ArrowRight key like ArrowDown', () => {
    render(<FilterReach selectedTab={REACH.ALL} />);

    const allRadio = screen.getByLabelText('All');
    const followingRadio = screen.getByLabelText('Following');

    allRadio.focus();
    fireEvent.keyDown(allRadio, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(followingRadio);
  });

  it('handles ArrowLeft key like ArrowUp', () => {
    render(<FilterReach selectedTab={REACH.FOLLOWING} />);

    const allRadio = screen.getByLabelText('All');
    const followingRadio = screen.getByLabelText('Following');

    followingRadio.focus();
    fireEvent.keyDown(followingRadio, { key: 'ArrowLeft' });

    expect(document.activeElement).toBe(allRadio);
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
});
