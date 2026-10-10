import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContentCard, ContentContainer, ContentImage } from './Content';

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    ...props
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    [key: string]: unknown;
  }) => <img data-testid="next-image" src={src} alt={alt} width={width} height={height} {...props} />,
}));

// Mock atoms
vi.mock('@/atoms/Card/Card', () => {
  return {
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="card" className={className}>
        {children}
      </div>
    ),
    CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-slot="card-content" className={className}>
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

describe('ContentCard', () => {
  it('renders with default props', () => {
    render(
      <ContentCard>
        <div>Test content</div>
      </ContentCard>,
    );

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('preserves the configured image dimensions without forcing a fixed visual column', () => {
    render(
      <ContentCard image={{ src: '/test.jpg', alt: 'Test image', width: 200, height: 200 }}>
        <div>Content with image</div>
      </ContentCard>,
    );

    const imageContainer = screen.getByTestId('content-image').parentElement;
    expect(imageContainer).toHaveStyle({ width: '200px', height: '200px' });
    expect(imageContainer).toHaveClass('hidden', 'lg:flex');
    expect(imageContainer?.parentElement).not.toHaveClass('w-48', 'shrink-0');
  });
});

describe('ContentContainer', () => {
  it('renders with default props', () => {
    render(
      <ContentContainer>
        <div>Container content</div>
      </ContentContainer>,
    );

    expect(screen.getByTestId('container')).toBeInTheDocument();
    expect(screen.getByText('Container content')).toBeInTheDocument();
  });

  it('applies the lg max width and md gap by default', () => {
    render(<ContentContainer>Defaults</ContentContainer>);
    expect(screen.getByTestId('container')).toHaveClass('max-w-(--container-max-width)', 'gap-6');
  });

  it.each([
    ['sm', 'max-w-[588px]'],
    ['md', 'max-w-[800px]'],
    ['lg', 'max-w-(--container-max-width)'],
    ['xl', 'max-w-[1400px]'],
  ] as const)('applies maxWidth=%s class', (maxWidth, className) => {
    render(<ContentContainer maxWidth={maxWidth}>Sized</ContentContainer>);
    expect(screen.getByTestId('container')).toHaveClass(className);
  });

  it.each([
    ['sm', 'gap-3'],
    ['md', 'gap-6'],
    ['lg', 'gap-8'],
  ] as const)('applies gap=%s class', (gap, className) => {
    render(<ContentContainer gap={gap}>Spaced</ContentContainer>);
    expect(screen.getByTestId('container')).toHaveClass(className);
  });

  it('merges a custom className', () => {
    render(<ContentContainer className="custom-class">Custom</ContentContainer>);
    expect(screen.getByTestId('container')).toHaveClass('custom-class', 'gap-6');
  });
});

describe('ContentImage', () => {
  it('renders with required props', () => {
    render(<ContentImage src="/test.jpg" alt="Test" width={100} height={100} />);

    const img = screen.getByTestId('content-image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/test.jpg');
  });

  it('hides on mobile by default', () => {
    const { container } = render(<ContentImage src="/test.jpg" alt="Test" width={100} height={100} />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('hidden', 'lg:flex');
  });

  it('shows on mobile when hiddenOnMobile is false', () => {
    const { container } = render(
      <ContentImage src="/test.jpg" alt="Test" width={100} height={100} hiddenOnMobile={false} />,
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex');
    expect(wrapper).not.toHaveClass('hidden');
  });
});
