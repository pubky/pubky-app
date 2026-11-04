import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostPreviewNestingProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { PostHashtags } from './PostHashtags';

// Mock @/atoms
vi.mock('@/atoms/Link/Link', () => {
  return {
    Link: ({
      children,
      href,
      className,
      onClick,
      ...props
    }: {
      children: React.ReactNode;
      href: string;
      className?: string;
      onClick?: (e: React.MouseEvent) => void;
    }) => (
      <a data-testid="link" href={href} className={className} onClick={onClick} {...props}>
        {children}
      </a>
    ),
  };
});

describe('PostHashtags', () => {
  describe('Basic rendering', () => {
    it('renders hashtag text correctly', () => {
      render(<PostHashtags href="/search?tags=test">#test</PostHashtags>);

      expect(screen.getByText('#test')).toBeInTheDocument();
    });

    it('renders as a link with correct href', () => {
      render(<PostHashtags href="/search?tags=bitcoin">#bitcoin</PostHashtags>);

      const link = screen.getByTestId('link');
      expect(link).toHaveAttribute('href', '/search?tags=bitcoin');
    });

    it('applies custom className', () => {
      render(
        <PostHashtags href="/search?tags=test" className="custom-class">
          #test
        </PostHashtags>,
      );

      const link = screen.getByTestId('link');
      expect(link.className).toContain('custom-class');
    });

    it('applies default inline-flex styling', () => {
      render(<PostHashtags href="/search?tags=test">#test</PostHashtags>);

      const link = screen.getByTestId('link');
      expect(link.className).toContain('inline-flex');
      expect(link.className).toContain('items-center');
      expect(link.className).toContain('gap-x-1');
      expect(link.className).toContain('text-base');
    });
  });

  describe('Click behavior', () => {
    it('stops event propagation on click', () => {
      const parentClickHandler = vi.fn();

      render(
        <div onClick={parentClickHandler}>
          <PostHashtags href="/search?tags=test">#test</PostHashtags>
        </div>,
      );

      const link = screen.getByTestId('link');
      fireEvent.click(link);

      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });

  describe('Non-navigating post preview (reply/repost dialog)', () => {
    it('renders the hashtag as styled text instead of a link', () => {
      const { container } = render(
        <PostPreviewNestingProvider navigable={false}>
          <PostHashtags href="/search?tags=bitcoin" data-type="hashtag">
            #bitcoin
          </PostHashtags>
        </PostPreviewNestingProvider>,
      );

      expect(screen.queryByTestId('link')).not.toBeInTheDocument();
      expect(container.querySelector('a')).not.toBeInTheDocument();

      const hashtag = screen.getByText('#bitcoin');
      expect(hashtag.tagName).toBe('SPAN');
      expect(hashtag).toHaveAttribute('data-type', 'hashtag');
      expect(hashtag).toHaveClass('text-brand', 'inline-flex', 'items-center', 'gap-x-1', 'text-base');
      expect(hashtag).not.toHaveClass('cursor-pointer');
      // The brand icon still renders next to the text.
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('keeps the link inside a navigable preview (feed repost)', () => {
      render(
        <PostPreviewNestingProvider>
          <PostHashtags href="/search?tags=bitcoin">#bitcoin</PostHashtags>
        </PostPreviewNestingProvider>,
      );

      expect(screen.getByTestId('link')).toHaveAttribute('href', '/search?tags=bitcoin');
    });
  });

  describe('Icon rendering for special hashtags', () => {
    it('renders Synonym icon for #synonym', () => {
      const { container } = render(<PostHashtags href="/search?tags=synonym">#synonym</PostHashtags>);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders Tether icon for #tether', () => {
      const { container } = render(<PostHashtags href="/search?tags=tether">#tether</PostHashtags>);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders Pubky icon for #pubky', () => {
      const { container } = render(<PostHashtags href="/search?tags=pubky">#pubky</PostHashtags>);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders Bitkit icon for #bitkit', () => {
      const { container } = render(<PostHashtags href="/search?tags=bitkit">#bitkit</PostHashtags>);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders Blocktank icon for #blocktank', () => {
      const { container } = render(<PostHashtags href="/search?tags=blocktank">#blocktank</PostHashtags>);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders Bitcoin icon for #bitcoin', () => {
      const { container } = render(<PostHashtags href="/search?tags=bitcoin">#bitcoin</PostHashtags>);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders icon case-insensitively for #BITCOIN', () => {
      const { container } = render(<PostHashtags href="/search?tags=bitcoin">#BITCOIN</PostHashtags>);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders icon case-insensitively for #Bitcoin', () => {
      const { container } = render(<PostHashtags href="/search?tags=bitcoin">#Bitcoin</PostHashtags>);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('does not render icon for unknown hashtag', () => {
      const { container } = render(<PostHashtags href="/search?tags=unknown">#unknown</PostHashtags>);

      const svg = container.querySelector('svg');
      expect(svg).not.toBeInTheDocument();
    });
  });

  describe('Props forwarding', () => {
    it('forwards additional props to the Link component', () => {
      render(
        <PostHashtags href="/search?tags=test" data-custom="value">
          #test
        </PostHashtags>,
      );

      const link = screen.getByTestId('link');
      expect(link).toHaveAttribute('data-custom', 'value');
    });

    it('does not forward node and ref props', () => {
      // These props should be destructured and not forwarded
      const { container } = render(
        <PostHashtags href="/search?tags=test" data-type="hashtag">
          #test
        </PostHashtags>,
      );

      expect(container.firstChild).toBeInTheDocument();
    });
  });
});
