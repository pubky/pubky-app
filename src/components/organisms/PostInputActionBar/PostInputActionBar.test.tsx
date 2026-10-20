import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { PostInputActionBar } from './PostInputActionBar';

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
      'aria-pressed': ariaPressed,
    }: {
      children: React.ReactNode;
      onClick?: React.MouseEventHandler;
      disabled?: boolean;
      className?: string;
      variant?: string;
      size?: string;
      style?: React.CSSProperties;
      'aria-label'?: string;
      'aria-pressed'?: boolean;
    }) => (
      <button
        onClick={onClick}
        disabled={disabled}
        className={className}
        data-variant={variant}
        data-size={size}
        style={style}
        aria-label={aria}
        aria-pressed={ariaPressed}
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

  it('blocks repeated submit clicks while waiting even if content validation permits submission', () => {
    const onPostClick = vi.fn();
    render(
      <PostInputActionBar hideArticleButton={false} onPostClick={onPostClick} isSubmitting isPostDisabled={false} />,
    );
    const submit = screen.getByRole('button', { name: 'Posting...' });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(onPostClick).not.toHaveBeenCalled();
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

  it('shows the image button whenever isArticle is false', () => {
    render(<PostInputActionBar hideArticleButton={false} isArticle={false} />);

    expect(screen.getByRole('button', { name: 'Add emoji' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add article' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
  });

  it('hides article button when hideArticleButton is true', () => {
    render(<PostInputActionBar hideArticleButton={true} />);

    expect(screen.queryByRole('button', { name: 'Add article' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add emoji' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
  });

  it('uses full width root layout', () => {
    const { container } = render(<PostInputActionBar hideArticleButton={false} />);

    expect(container.firstChild).toHaveClass('w-full');
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

  it('does not render the lock switch when lockSwitch is not provided', () => {
    render(<PostInputActionBar hideArticleButton={false} />);
    expect(screen.queryByRole('switch', { name: 'Lock content' })).not.toBeInTheDocument();
  });

  it('renders the lock switch when lockSwitch is provided', () => {
    render(<PostInputActionBar hideArticleButton={false} lockSwitch={{ checked: false, onCheckedChange: vi.fn() }} />);
    expect(screen.getByRole('switch', { name: 'Lock content' })).toBeInTheDocument();
  });

  it('calls lockSwitch.onCheckedChange when the lock switch is toggled', () => {
    const onCheckedChange = vi.fn();
    render(<PostInputActionBar hideArticleButton={false} lockSwitch={{ checked: false, onCheckedChange }} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Lock content' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});

describe('PostInputActionBar - article controls', () => {
  it('renders leading content before the action buttons', () => {
    render(
      <PostInputActionBar
        hideArticleButton
        isArticle
        leadingContent={<span data-testid="leading-avatar">avatar</span>}
      />,
    );

    const leading = screen.getByTestId('leading-avatar');
    const [leftGroup] = screen.getAllByTestId('container').slice(1);
    expect(leftGroup.firstElementChild).toBe(leading);
  });

  it('does not render a fullscreen toggle unless one is provided', () => {
    render(<PostInputActionBar hideArticleButton isArticle />);

    expect(screen.queryByRole('button', { name: /fullscreen/i })).not.toBeInTheDocument();
  });

  it('renders the fullscreen toggle with the expand icon and calls onToggle', () => {
    const onToggle = vi.fn();
    render(<PostInputActionBar hideArticleButton isArticle fullscreen={{ isFullscreen: false, onToggle }} />);

    const toggle = screen.getByRole('button', { name: 'Enter fullscreen' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle.querySelector('.lucide-expand')).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('labels the toggle as exit with the shrink icon while fullscreen', () => {
    render(<PostInputActionBar hideArticleButton isArticle fullscreen={{ isFullscreen: true, onToggle: vi.fn() }} />);

    const toggle = screen.getByRole('button', { name: 'Exit fullscreen' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle.querySelector('.lucide-shrink')).toBeInTheDocument();
  });

  it('disables the fullscreen toggle while submitting', () => {
    render(
      <PostInputActionBar
        hideArticleButton
        isArticle
        isSubmitting
        fullscreen={{ isFullscreen: false, onToggle: vi.fn() }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeDisabled();
  });
});
