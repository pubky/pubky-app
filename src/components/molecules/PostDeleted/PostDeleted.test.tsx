import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostDeleted } from './PostDeleted';

// Mock atoms
vi.mock('@/atoms/Card/Card', () => {
  return {
    CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="card-content" className={className}>
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

describe('PostDeleted', () => {
  it('renders the deleted message', () => {
    render(<PostDeleted />);
    expect(screen.getByText(/This post has been deleted by its author/i)).toBeInTheDocument();
  });

  it('renders CardContent wrapper', () => {
    render(<PostDeleted />);
    expect(screen.getByTestId('card-content')).toBeInTheDocument();
  });

  it('renders Typography with correct size', () => {
    render(<PostDeleted />);
    const typography = screen.getByTestId('typography');
    expect(typography).toHaveAttribute('data-size', 'sm');
  });

  it('applies correct styling classes to CardContent', () => {
    render(<PostDeleted />);
    const cardContent = screen.getByTestId('card-content');
    expect(cardContent).toHaveClass('py-2');
  });

  it('applies correct styling classes to Typography', () => {
    render(<PostDeleted />);
    const typography = screen.getByTestId('typography');
    expect(typography).toHaveClass('text-center');
    expect(typography).toHaveClass('font-normal');
    expect(typography).toHaveClass('text-muted-foreground');
  });
});

describe('PostDeleted - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<PostDeleted />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
