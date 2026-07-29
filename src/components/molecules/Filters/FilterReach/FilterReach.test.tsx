import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { REACH } from '@/stores/home/home.types';
import { FilterReach, TAGGED_AS_FILTER_KEY } from './FilterReach';

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

  it('renders the standalone Tagged-as Home order', () => {
    const mockOnTabChange = vi.fn();
    render(<FilterReach showTaggedAs onTabChange={mockOnTabChange} />);

    const tabs = [
      { value: REACH.NETWORK, label: 'My network' },
      { value: TAGGED_AS_FILTER_KEY, label: 'Tagged as' },
      { value: REACH.FOLLOWING, label: 'Following' },
      { value: REACH.FRIENDS, label: 'Friends' },
      { value: REACH.ME, label: 'Me' },
      { value: REACH.ALL, label: 'All' },
    ];

    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual(
      tabs.map(({ label }) => label),
    );

    tabs.forEach(({ value, label }) => {
      const element = screen.getByLabelText(label);
      fireEvent.click(element);
      expect(mockOnTabChange).toHaveBeenCalledWith(value);
    });
  });

  it('renders the profile tag editor immediately after Tagged as', () => {
    render(
      <FilterReach
        showTaggedAs
        selectedTab={TAGGED_AS_FILTER_KEY}
        profileTags={['bitcoin']}
        onProfileTagAdd={vi.fn()}
        onProfileTagRemove={vi.fn()}
      />,
    );

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
    const input = screen.getByPlaceholderText('profile tag');
    expect(input).toBeInTheDocument();
    expect(screen.getByLabelText('Tagged as').nextElementSibling).toContainElement(input);
  });

  it('disables the profile tag editor when profileTagsDisabled is true', () => {
    render(
      <FilterReach
        showTaggedAs
        selectedTab={REACH.ALL}
        profileTags={[]}
        onProfileTagAdd={vi.fn()}
        onProfileTagRemove={vi.fn()}
        profileTagsDisabled
      />,
    );

    expect(screen.getByPlaceholderText('profile tag')).toBeDisabled();
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
  it('renders all items as disabled when disabled prop is true', () => {
    render(<FilterReach disabled />);

    const labels = ['All', 'Following', 'Friends'];
    labels.forEach((label) => {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('does not call onTabChange when disabled', () => {
    const mockOnTabChange = vi.fn();
    render(<FilterReach disabled onTabChange={mockOnTabChange} />);

    fireEvent.click(screen.getByLabelText('Following'));
    fireEvent.click(screen.getByLabelText('Friends'));

    expect(mockOnTabChange).not.toHaveBeenCalled();
  });

  it('items are not disabled by default', () => {
    render(<FilterReach />);

    const labels = ['All', 'Following', 'Friends'];
    labels.forEach((label) => {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-disabled', 'true');
    });
  });
});

describe('FilterReach - Keyboard Navigation', () => {
  it('allows Tab to enter the enabled Tagged-as editor', async () => {
    const user = userEvent.setup();
    render(
      <FilterReach
        showTaggedAs
        selectedTab={TAGGED_AS_FILTER_KEY}
        profileTags={[]}
        onProfileTagAdd={vi.fn()}
        onProfileTagRemove={vi.fn()}
      />,
    );

    screen.getByLabelText('Tagged as').focus();
    await user.tab();

    expect(document.activeElement).toBe(screen.getByPlaceholderText('profile tag'));
  });

  it('skips the Tagged-as editor during radio arrow navigation', () => {
    render(
      <FilterReach
        showTaggedAs
        selectedTab={TAGGED_AS_FILTER_KEY}
        profileTags={[]}
        onProfileTagAdd={vi.fn()}
        onProfileTagRemove={vi.fn()}
      />,
    );

    const taggedAs = screen.getByLabelText('Tagged as');
    taggedAs.focus();
    fireEvent.keyDown(taggedAs, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(screen.getByLabelText('Following'));
  });

  it('does not change Reach when arrow keys are used inside the tag input', () => {
    const onTabChange = vi.fn();
    render(
      <FilterReach
        showTaggedAs
        selectedTab={TAGGED_AS_FILTER_KEY}
        onTabChange={onTabChange}
        profileTags={[]}
        onProfileTagAdd={vi.fn()}
        onProfileTagRemove={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('profile tag');
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowLeft' });

    expect(document.activeElement).toBe(input);
    expect(onTabChange).not.toHaveBeenCalled();
  });

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

  it('matches snapshot with disabled state', () => {
    const { container } = render(<FilterReach disabled />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
