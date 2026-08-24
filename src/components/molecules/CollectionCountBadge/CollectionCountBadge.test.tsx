import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CollectionCountBadge } from './CollectionCountBadge';

describe('CollectionCountBadge', () => {
  it('renders the formatted count with a pluralized label from sm breakpoint up', () => {
    render(<CollectionCountBadge count={42} />);

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('posts', { exact: false })).toHaveClass('hidden', 'sm:inline');
  });

  it('renders the singular label for a count of one from sm breakpoint up', () => {
    render(<CollectionCountBadge count={1} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('post', { exact: true })).toHaveClass('hidden', 'sm:inline');
  });

  it('can keep the label visible on mobile', () => {
    render(<CollectionCountBadge count={42} showLabelOnMobile />);

    expect(screen.getByText('posts', { exact: false })).toHaveClass('inline');
    expect(screen.getByText('posts', { exact: false })).not.toHaveClass('hidden');
  });

  it('renders a zero count rather than hiding it', () => {
    render(<CollectionCountBadge count={0} />);

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByLabelText('0 posts')).toBeInTheDocument();
  });

  it('uses bg-card for the on-muted embed tone', () => {
    const { container } = render(<CollectionCountBadge count={5} tone="on-muted" />);

    expect(container.firstChild).toHaveClass('bg-card');
    expect(container.firstChild).not.toHaveClass('bg-background');
  });
});

describe('CollectionCountBadge - Snapshots', () => {
  it('matches the snapshot', () => {
    const { container } = render(<CollectionCountBadge count={123} />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot with the label visible on mobile', () => {
    const { container } = render(<CollectionCountBadge count={123} showLabelOnMobile />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
