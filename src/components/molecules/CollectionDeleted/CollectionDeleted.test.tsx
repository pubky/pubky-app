import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CollectionDeleted } from './CollectionDeleted';

// Mock atoms
vi.mock('@/atoms/Card/Card', () => {
  return {
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="card" className={className}>
        {children}
      </div>
    ),
    CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="card-content" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, size, className }: { children: React.ReactNode; size?: string; className?: string }) => (
      <p data-testid="typography" data-size={size} className={className}>
        {children}
      </p>
    ),
  };
});

describe('CollectionDeleted', () => {
  it('renders the deleted message', () => {
    render(<CollectionDeleted />);
    expect(screen.getByText(/This collection has been deleted by its author/i)).toBeInTheDocument();
  });

  it('renders the full card shell (Container > Card > CardContent)', () => {
    render(<CollectionDeleted />);
    expect(screen.getByTestId('container')).toBeInTheDocument();
    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByTestId('card-content')).toBeInTheDocument();
  });

  it('matches the regular CollectionCard outer footprint (full width, lg max-width)', () => {
    render(<CollectionDeleted />);
    const container = screen.getByTestId('container');
    // Must mirror CollectionCard's outer wrapper so the deleted slot has
    // the same footprint in any grid it lands in.
    expect(container).toHaveClass('block', 'h-full', 'w-full', 'lg:max-w-187');
  });

  it('centers the deleted message within the card', () => {
    render(<CollectionDeleted />);
    const cardContent = screen.getByTestId('card-content');
    expect(cardContent).toHaveClass('items-center', 'justify-center');
  });

  it('renders Typography with correct size', () => {
    render(<CollectionDeleted />);
    expect(screen.getByTestId('typography')).toHaveAttribute('data-size', 'sm');
  });

  it('applies muted-foreground centered text styling', () => {
    render(<CollectionDeleted />);
    const typography = screen.getByTestId('typography');
    expect(typography).toHaveClass('text-center', 'font-normal', 'text-muted-foreground');
  });

  it('merges a caller-provided className onto the outer container', () => {
    render(<CollectionDeleted className="custom-extra" />);
    expect(screen.getByTestId('container')).toHaveClass('custom-extra');
  });
});

describe('CollectionDeleted - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<CollectionDeleted />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
