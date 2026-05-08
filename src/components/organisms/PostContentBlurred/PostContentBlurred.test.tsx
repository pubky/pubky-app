import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostContentBlurred } from './PostContentBlurred';

// Mock dependencies
const mockUnblur = vi.fn();
vi.mock('@/controllers/moderation/moderation', () => ({
  ModerationController: {
    unBlur: (...args: unknown[]) => mockUnblur(...args),
  },
}));

// Mock Atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      onClick,
      className,
      overrideDefaults,
      ...props
    }: {
      children: React.ReactNode;
      onClick?: (e: React.MouseEvent) => void;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <button
        data-testid="blurred-content-button"
        data-override-defaults={overrideDefaults}
        onClick={onClick}
        className={className}
        {...props}
      >
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      overrideDefaults,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <div data-testid="container" data-override-defaults={overrideDefaults} className={className} {...props}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      className,
      as: Component = 'span',
      overrideDefaults,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      as?: React.ElementType;
      overrideDefaults?: boolean;
    }) => (
      <Component data-testid="typography" data-override-defaults={overrideDefaults} className={className} {...props}>
        {children}
      </Component>
    ),
  };
});

describe('PostContentBlurred', () => {
  const defaultProps = {
    postId: 'test-post-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the blurred content button', () => {
    render(<PostContentBlurred {...defaultProps} />);

    const button = screen.getByTestId('blurred-content-button');
    expect(button).toBeInTheDocument();
  });

  it('renders the eye-off icon', () => {
    render(<PostContentBlurred {...defaultProps} />);

    const button = screen.getByTestId('blurred-content-button');
    expect(button.querySelector('.lucide-eye-off')).toBeInTheDocument();
  });

  it('displays the moderated post message', () => {
    render(<PostContentBlurred {...defaultProps} />);

    expect(screen.getByText('Post content moderated.')).toBeInTheDocument();
  });

  it('displays blurred placeholder text', () => {
    render(<PostContentBlurred {...defaultProps} />);

    expect(screen.getByText(/Lorem ipsum dolor sit amet, consectetur adipiscing elit/)).toBeInTheDocument();
  });

  it('calls ModerationController.unblur with postId when clicked', () => {
    render(<PostContentBlurred {...defaultProps} />);

    const button = screen.getByTestId('blurred-content-button');
    fireEvent.click(button);

    expect(mockUnblur).toHaveBeenCalledTimes(1);
    expect(mockUnblur).toHaveBeenCalledWith('test-post-123');
  });

  it('stops event propagation when clicked', () => {
    const parentClickHandler = vi.fn();

    render(
      <div onClick={parentClickHandler}>
        <PostContentBlurred {...defaultProps} />
      </div>,
    );

    const button = screen.getByTestId('blurred-content-button');
    fireEvent.click(button);

    expect(parentClickHandler).not.toHaveBeenCalled();
  });

  it('applies custom className when provided', () => {
    render(<PostContentBlurred {...defaultProps} className="custom-class" />);

    const button = screen.getByTestId('blurred-content-button');
    expect(button).toHaveClass('custom-class');
  });

  it('applies default className for cursor and width', () => {
    render(<PostContentBlurred {...defaultProps} />);

    const button = screen.getByTestId('blurred-content-button');
    expect(button).toHaveClass('group');
    expect(button).toHaveClass('relative');
    expect(button).toHaveClass('w-full');
    expect(button).toHaveClass('cursor-pointer');
  });

  it('uses overrideDefaults on Button', () => {
    render(<PostContentBlurred {...defaultProps} />);

    const button = screen.getByTestId('blurred-content-button');
    expect(button).toHaveAttribute('data-override-defaults', 'true');
  });

  it('sets aria-hidden on blurred placeholder text', () => {
    render(<PostContentBlurred {...defaultProps} />);

    const blurredText = screen.getByText(/Lorem ipsum dolor sit amet, consectetur adipiscing elit/);
    expect(blurredText).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('PostContentBlurred - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot with default props', () => {
    const { container } = render(<PostContentBlurred postId="snapshot-post-1" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<PostContentBlurred postId="snapshot-post-2" className="mt-4 rounded-lg" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
