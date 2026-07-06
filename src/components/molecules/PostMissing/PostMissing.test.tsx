import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostMissing } from './PostMissing';

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

describe('PostMissing', () => {
  it('renders the not-found message', () => {
    render(<PostMissing />);
    expect(screen.getByText(/Post not found/i)).toBeInTheDocument();
  });

  it('renders CardContent wrapper', () => {
    render(<PostMissing />);
    expect(screen.getByTestId('card-content')).toBeInTheDocument();
  });

  it('renders Typography with correct size', () => {
    render(<PostMissing />);
    const typography = screen.getByTestId('typography');
    expect(typography).toHaveAttribute('data-size', 'sm');
  });

  it('applies correct styling classes to CardContent', () => {
    render(<PostMissing />);
    const cardContent = screen.getByTestId('card-content');
    expect(cardContent).toHaveClass('py-2');
  });

  it('applies correct styling classes to Typography', () => {
    render(<PostMissing />);
    const typography = screen.getByTestId('typography');
    expect(typography).toHaveClass('text-center');
    expect(typography).toHaveClass('font-normal');
    expect(typography).toHaveClass('text-muted-foreground');
  });
});

describe('PostMissing - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<PostMissing />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
