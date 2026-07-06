import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CollectionCountBadge } from './CollectionCountBadge';

vi.mock('next-intl', () => ({
  useFormatter: () => ({
    number: (value: number, _options?: Intl.NumberFormatOptions) => String(value),
  }),
  useTranslations: () => (key: string, values?: { count?: number }) =>
    key === 'postCount' ? (values?.count === 1 ? 'post' : 'posts') : key,
}));

describe('CollectionCountBadge', () => {
  it('renders the formatted count with a pluralized label', () => {
    render(<CollectionCountBadge count={42} />);

    expect(screen.getByText('42 posts')).toBeInTheDocument();
  });

  it('renders the singular label for a count of one', () => {
    render(<CollectionCountBadge count={1} />);

    expect(screen.getByText('1 post')).toBeInTheDocument();
  });

  it('renders a zero count rather than hiding it', () => {
    render(<CollectionCountBadge count={0} />);

    expect(screen.getByText('0 posts')).toBeInTheDocument();
  });
});

describe('CollectionCountBadge - Snapshots', () => {
  it('matches the snapshot', () => {
    const { container } = render(<CollectionCountBadge count={123} />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot in the on-cover pill variant', () => {
    const { container } = render(<CollectionCountBadge count={123} onCover />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
