import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RepostHeader } from './RepostHeader';

vi.mock('@/atoms', () => ({
  Container: ({
    children,
    className,
    overrideDefaults,
    ['data-testid']: dataTestId,
  }: {
    children: React.ReactNode;
    className?: string;
    overrideDefaults?: boolean;
    'data-testid'?: string;
  }) => (
    <div data-testid={dataTestId ?? 'container'} className={className} data-override-defaults={overrideDefaults}>
      {children}
    </div>
  ),
  Typography: ({
    children,
    className,
    ['data-testid']: dataTestId,
  }: {
    children: React.ReactNode;
    className?: string;
    'data-testid'?: string;
  }) => (
    <span data-testid={dataTestId ?? 'typography'} className={className}>
      {children}
    </span>
  ),
}));

vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
  };
});

describe('RepostHeader', () => {
  it('renders text and icon', () => {
    render(<RepostHeader />);

    expect(screen.getByTestId('repost-header')).toBeInTheDocument();
    expect(screen.getByText('You reposted')).toBeInTheDocument();
  });

  it('does not render an undo button', () => {
    render(<RepostHeader />);

    // The undo button has been moved to the toast notification
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('RepostHeader - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<RepostHeader />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
