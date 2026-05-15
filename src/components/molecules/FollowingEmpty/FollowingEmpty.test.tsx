import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FollowingEmpty } from './FollowingEmpty';

// Mock atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({ children, className, variant }: { children: React.ReactNode; className?: string; variant?: string }) => (
      <button data-testid="button" className={className} data-variant={variant}>
        {children}
      </button>
    ),
    ButtonVariant: {
      DEFAULT: 'default',
      DESTRUCTIVE: 'destructive',
      OUTLINE: 'outline',
      SECONDARY: 'secondary',
      GHOST: 'ghost',
      BRAND: 'brand',
      LINK: 'link',
    },
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
    Typography: ({
      children,
      as: Tag = 'p',
      className,
    }: {
      children: React.ReactNode;
      as?: React.ElementType;
      className?: string;
    }) => (
      <Tag data-testid="typography" className={className}>
        {children}
      </Tag>
    ),
  };
});

describe('FollowingEmpty', () => {
  it('renders title', () => {
    render(<FollowingEmpty />);
    expect(screen.getByText(/You are the algorithm/i)).toBeInTheDocument();
  });
});

describe('FollowingEmpty - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<FollowingEmpty />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
