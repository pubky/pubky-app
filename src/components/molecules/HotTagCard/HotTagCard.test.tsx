import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HotTagCard } from './HotTagCard';
import { TIMEFRAME } from '@/stores/hot/hot.types';
describe('HotTagCard', () => {
  const defaultProps = {
    rank: 1,
    tagName: 'bitcoin',
    postCount: 371,
  };

  it('renders with required props', () => {
    render(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_MONTH} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('bitcoin')).toBeInTheDocument();
    expect(screen.getByText('371 posts this month')).toBeInTheDocument();
  });

  it('renders "today" text when timeframe is TODAY', () => {
    render(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.TODAY} />);

    expect(screen.getByText('371 posts today')).toBeInTheDocument();
  });

  it('renders "this week" text when timeframe is THIS_WEEK', () => {
    render(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_WEEK} />);

    expect(screen.getByText('371 posts this week')).toBeInTheDocument();
  });

  it('renders "this month" text when timeframe is THIS_MONTH', () => {
    render(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_MONTH} />);

    expect(screen.getByText('371 posts this month')).toBeInTheDocument();
  });

  it('renders generic text when timeframe is ALL_TIME', () => {
    render(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.ALL_TIME} />);

    expect(screen.getByText('371 posts')).toBeInTheDocument();
  });

  it('formats large post counts with locale separators', () => {
    render(<HotTagCard {...defaultProps} postCount={1234567} timeframe={TIMEFRAME.THIS_MONTH} />);

    // Use regex to match formatted number (handles different locale separators)
    expect(screen.getByText(/1[,.]234[,.]567 posts this month/)).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const mockOnClick = vi.fn();
    render(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_MONTH} onClick={mockOnClick} />);

    const card = screen.getByTestId('hot-tag-card-1');
    fireEvent.click(card);

    expect(mockOnClick).toHaveBeenCalledWith('bitcoin');
  });

  it('calls onClick when Enter key is pressed', () => {
    const mockOnClick = vi.fn();
    render(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_MONTH} onClick={mockOnClick} />);

    const card = screen.getByTestId('hot-tag-card-1');
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(mockOnClick).toHaveBeenCalledWith('bitcoin');
  });

  it('calls onClick when Space key is pressed', () => {
    const mockOnClick = vi.fn();
    render(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_MONTH} onClick={mockOnClick} />);

    const card = screen.getByTestId('hot-tag-card-1');
    fireEvent.keyDown(card, { key: ' ' });

    expect(mockOnClick).toHaveBeenCalledWith('bitcoin');
  });

  it('does not call onClick for other keys', () => {
    const mockOnClick = vi.fn();
    render(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_MONTH} onClick={mockOnClick} />);

    const card = screen.getByTestId('hot-tag-card-1');
    fireEvent.keyDown(card, { key: 'Escape' });

    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('renders with custom data-testid', () => {
    render(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_MONTH} data-testid="custom-card" />);

    expect(screen.getByTestId('custom-card')).toBeInTheDocument();
  });

  it('renders taggers avatars', () => {
    const taggers = [
      { id: '1', name: 'User 1', avatarUrl: 'https://example.com/avatar1.png' },
      { id: '2', name: 'User 2', avatarUrl: 'https://example.com/avatar2.png' },
    ];

    render(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_MONTH} taggers={taggers} />);

    expect(screen.getByTestId('hot-tag-card-mobile-avatars')).toHaveClass('sm:hidden');
    expect(screen.getByTestId('hot-tag-card-desktop-avatars')).toHaveClass('hidden', 'sm:flex');
  });

  it('shows overflow based on postCount minus visible avatars', () => {
    const taggers = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
    }));

    // postCount is 371 (default), showing 6 avatars → overflow is 371 - 6 = 365 → +99
    render(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_MONTH} taggers={taggers} maxAvatars={6} />);

    expect(within(screen.getByTestId('hot-tag-card-mobile-avatars')).getByText('+99')).toBeInTheDocument();
    expect(within(screen.getByTestId('hot-tag-card-desktop-avatars')).getByText('+99')).toBeInTheDocument();
  });

  it('shows correct overflow for smaller postCount', () => {
    const taggers = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
    }));

    // postCount is 50, showing 6 avatars → overflow is 50 - 6 = 44
    render(
      <HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_MONTH} postCount={50} taggers={taggers} maxAvatars={6} />,
    );

    expect(within(screen.getByTestId('hot-tag-card-mobile-avatars')).getByText('+44')).toBeInTheDocument();
    expect(within(screen.getByTestId('hot-tag-card-desktop-avatars')).getByText('+44')).toBeInTheDocument();
  });

  it('does not show overflow when postCount equals visible avatars', () => {
    const taggers = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
    }));

    // postCount is 6, showing 6 avatars → no overflow
    render(
      <HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_MONTH} postCount={6} taggers={taggers} maxAvatars={6} />,
    );

    expect(within(screen.getByTestId('hot-tag-card-mobile-avatars')).queryByText(/^\+/)).not.toBeInTheDocument();
    expect(within(screen.getByTestId('hot-tag-card-desktop-avatars')).queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it('caps overflow display at +99 for large postCounts', () => {
    const taggers = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
    }));

    // postCount is 500, showing 6 avatars → overflow is 494 → +99
    render(
      <HotTagCard
        {...defaultProps}
        timeframe={TIMEFRAME.THIS_MONTH}
        postCount={500}
        taggers={taggers}
        maxAvatars={6}
      />,
    );

    expect(within(screen.getByTestId('hot-tag-card-mobile-avatars')).getByText('+99')).toBeInTheDocument();
    expect(within(screen.getByTestId('hot-tag-card-desktop-avatars')).getByText('+99')).toBeInTheDocument();
  });

  it('renders different ranks correctly', () => {
    const { rerender } = render(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_MONTH} rank={1} />);
    expect(screen.getByText('1')).toBeInTheDocument();

    rerender(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_MONTH} rank={2} />);
    expect(screen.getByText('2')).toBeInTheDocument();

    rerender(<HotTagCard {...defaultProps} timeframe={TIMEFRAME.THIS_MONTH} rank={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('HotTagCard - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(
      <HotTagCard rank={1} tagName="bitcoin" postCount={371} timeframe={TIMEFRAME.THIS_MONTH} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with taggers', () => {
    const taggers = [
      { id: '1', name: 'Alice', avatarUrl: 'https://example.com/alice.png' },
      { id: '2', name: 'Bob', avatarUrl: 'https://example.com/bob.png' },
    ];
    const { container } = render(
      <HotTagCard rank={2} tagName="ethereum" postCount={250} taggers={taggers} timeframe={TIMEFRAME.THIS_MONTH} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with overflow taggers', () => {
    const taggers = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
    }));
    const { container } = render(
      <HotTagCard rank={3} tagName="defi" postCount={100} taggers={taggers} timeframe={TIMEFRAME.THIS_MONTH} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with small postCount', () => {
    const { container } = render(<HotTagCard rank={1} tagName="nft" postCount={50} timeframe={TIMEFRAME.ALL_TIME} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
