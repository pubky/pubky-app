import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimelineLoadMore } from './TimelineLoadMore';

describe('TimelineLoadMore', () => {
  it('renders a Load more button', () => {
    render(<TimelineLoadMore onLoadMore={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });

  it('calls onLoadMore when clicked', () => {
    const onLoadMore = vi.fn();
    render(<TimelineLoadMore onLoadMore={onLoadMore} />);

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});

describe('TimelineLoadMore - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<TimelineLoadMore onLoadMore={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
