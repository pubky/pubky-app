import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostInputActionBar } from './PostInputActionBar';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';

// Use real libs - use actual implementations

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

// Minimal atoms used by PostInputActionBar
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      onClick,
      disabled,
      className,
      variant,
      size,
      style,
      'aria-label': aria,
    }: {
      children: React.ReactNode;
      onClick?: React.MouseEventHandler;
      disabled?: boolean;
      className?: string;
      variant?: string;
      size?: string;
      style?: React.CSSProperties;
      'aria-label'?: string;
    }) => (
      <button
        onClick={onClick}
        disabled={disabled}
        className={className}
        data-variant={variant}
        data-size={size}
        style={style}
        aria-label={aria}
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
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <div data-testid="container" className={className} data-override-defaults={overrideDefaults}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      as,
      size,
      className,
    }: {
      children: React.ReactNode;
      as?: React.ElementType;
      size?: string;
      className?: string;
    }) => {
      const Tag = as || 'p';
      return (
        <Tag data-testid="typography" data-as={as} data-size={size} className={className}>
          {children}
        </Tag>
      );
    },
  };
});

describe('PostInputActionBar', () => {
  const mockUseIsMobile = vi.mocked(useIsMobile);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it('renders all action buttons with aria labels', () => {
    render(<PostInputActionBar hideArticleButton={false} />);

    expect(screen.getByRole('button', { name: 'Add emoji' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add article' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
  });

  it('invokes callbacks when buttons are clicked', () => {
    const onEmojiClick = vi.fn();
    const onImageClick = vi.fn();
    const onArticleClick = vi.fn();
    const onPostClick = vi.fn();

    render(
      <PostInputActionBar
        hideArticleButton={false}
        onEmojiClick={onEmojiClick}
        onImageClick={onImageClick}
        onArticleClick={onArticleClick}
        onPostClick={onPostClick}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add emoji' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add article' }));
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));

    expect(onEmojiClick).toHaveBeenCalledTimes(1);
    expect(onImageClick).toHaveBeenCalledTimes(1);
    expect(onArticleClick).toHaveBeenCalledTimes(1);
    expect(onPostClick).toHaveBeenCalledTimes(1);
  });

  it('disables Post button when isPostDisabled is true', () => {
    render(<PostInputActionBar hideArticleButton={false} isPostDisabled={true} />);

    const postButton = screen.getByRole('button', { name: 'Post' });
    expect(postButton).toBeDisabled();
  });

  it('enables Post button when isPostDisabled is false and handler is provided', () => {
    const onPostClick = vi.fn();
    render(<PostInputActionBar hideArticleButton={false} isPostDisabled={false} onPostClick={onPostClick} />);

    const postButton = screen.getByRole('button', { name: 'Post' });
    expect(postButton).not.toBeDisabled();
  });

  it('disables buttons without handlers', () => {
    render(<PostInputActionBar hideArticleButton={false} />);

    expect(screen.getByRole('button', { name: 'Add emoji' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add image' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add article' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });

  it('renders Post button with label text', () => {
    render(<PostInputActionBar hideArticleButton={false} />);

    const postButton = screen.getByRole('button', { name: 'Post' });
    expect(postButton).toHaveTextContent('Post');
  });

  it('shows loading state when isSubmitting is true', () => {
    render(<PostInputActionBar hideArticleButton={false} onPostClick={vi.fn()} isSubmitting={true} />);

    const postButton = screen.getByRole('button', { name: 'Posting...' });
    expect(postButton).toHaveTextContent('Posting...');
  });

  it('disables all buttons when isSubmitting is true', () => {
    render(<PostInputActionBar hideArticleButton={false} onEmojiClick={vi.fn()} isSubmitting={true} />);

    expect(screen.getByRole('button', { name: 'Add emoji' })).toBeDisabled();
  });

  it('renders reply labeling when postButtonAriaLabel is Reply', () => {
    render(<PostInputActionBar hideArticleButton={false} postButtonLabel="Reply" postButtonAriaLabel="Reply" />);
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
  });

  it('hides emoji, image, and file buttons when isArticle is true', () => {
    render(<PostInputActionBar hideArticleButton={false} isArticle={true} />);

    expect(screen.queryByRole('button', { name: 'Add emoji' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add image' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add article' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
  });

  it('hides image and file buttons but shows emoji when isEdit is true', () => {
    render(<PostInputActionBar hideArticleButton={false} isEdit={true} />);

    expect(screen.getByRole('button', { name: 'Add emoji' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add image' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add article' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
  });

  it('hides article button when hideArticleButton is true', () => {
    render(<PostInputActionBar hideArticleButton={true} />);

    expect(screen.queryByRole('button', { name: 'Add article' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add emoji' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
  });

  it('does not render character limit when not provided', () => {
    render(<PostInputActionBar hideArticleButton={false} />);

    expect(screen.queryByText(/^\d+\/\d+$/)).not.toBeInTheDocument();
  });

  it('renders character limit when provided', () => {
    render(<PostInputActionBar hideArticleButton={false} characterLimit={{ count: 45, max: 300 }} />);

    expect(screen.getByText('45/300')).toBeInTheDocument();
  });

  it('uses desktop-only classes for character limit', () => {
    render(<PostInputActionBar hideArticleButton={false} characterLimit={{ count: 45, max: 300 }} />);

    expect(screen.getByText('45/300')).toHaveClass('hidden');
    expect(screen.getByText('45/300')).toHaveClass('sm:block');
  });

  it('uses default size for post button on mobile', () => {
    mockUseIsMobile.mockReturnValue(true);
    render(<PostInputActionBar hideArticleButton={false} />);

    expect(screen.getByRole('button', { name: 'Post' })).toHaveAttribute('data-size', 'default');
  });

  it('uses small size for post button on desktop', () => {
    render(<PostInputActionBar hideArticleButton={false} />);

    expect(screen.getByRole('button', { name: 'Post' })).toHaveAttribute('data-size', 'sm');
  });

  it('renders custom post icon when provided', () => {
    const CustomIcon = ({ className }: { className?: string; strokeWidth?: number }) => (
      <svg data-testid="custom-post-icon" className={className} />
    );

    render(<PostInputActionBar hideArticleButton={false} postButtonIcon={CustomIcon} />);

    expect(screen.getByTestId('custom-post-icon')).toBeInTheDocument();
  });
});

describe('PostInputActionBar - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot with default props', () => {
    const { container } = render(<PostInputActionBar hideArticleButton={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with all callbacks', () => {
    const onEmojiClick = vi.fn();
    const onImageClick = vi.fn();
    const onArticleClick = vi.fn();
    const onPostClick = vi.fn();

    const { container } = render(
      <PostInputActionBar
        hideArticleButton={false}
        onEmojiClick={onEmojiClick}
        onImageClick={onImageClick}
        onArticleClick={onArticleClick}
        onPostClick={onPostClick}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with disabled post button', () => {
    const { container } = render(<PostInputActionBar hideArticleButton={false} isPostDisabled={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with hideArticleButton prop', () => {
    const { container } = render(<PostInputActionBar hideArticleButton={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with isArticle prop', () => {
    const { container } = render(<PostInputActionBar hideArticleButton={false} isArticle={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with isEdit prop', () => {
    const { container } = render(<PostInputActionBar hideArticleButton={false} isEdit={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
