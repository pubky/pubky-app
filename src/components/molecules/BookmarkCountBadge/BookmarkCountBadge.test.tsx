import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BookmarkCountBadge } from './BookmarkCountBadge';

vi.mock('next-intl', () => ({
  useFormatter: () => ({
    number: (value: number, _options?: Intl.NumberFormatOptions) => String(value),
  }),
}));

describe('BookmarkCountBadge', () => {
  it('renders the formatted count', () => {
    render(<BookmarkCountBadge count={42} />);

    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders a zero count rather than hiding it', () => {
    render(<BookmarkCountBadge count={0} />);

    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

describe('BookmarkCountBadge - Snapshots', () => {
  it('matches the snapshot', () => {
    const { container } = render(<BookmarkCountBadge count={123} />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
