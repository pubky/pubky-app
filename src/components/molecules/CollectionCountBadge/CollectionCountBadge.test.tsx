import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CollectionCountBadge } from './CollectionCountBadge';

vi.mock('next-intl', () => ({
  useFormatter: () => ({
    number: (value: number, _options?: Intl.NumberFormatOptions) => String(value),
  }),
}));

describe('CollectionCountBadge', () => {
  it('renders the formatted count', () => {
    render(<CollectionCountBadge count={42} />);

    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders a zero count rather than hiding it', () => {
    render(<CollectionCountBadge count={0} />);

    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

describe('CollectionCountBadge - Snapshots', () => {
  it('matches the snapshot', () => {
    const { container } = render(<CollectionCountBadge count={123} />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
