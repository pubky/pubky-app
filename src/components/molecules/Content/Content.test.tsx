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

describe('Content - Snapshots', () => {
  it('matches snapshot for ContentCard with default props', () => {
    const { container } = render(
      <ContentCard>
        <div>Test content</div>
      </ContentCard>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ContentCard with custom className', () => {
    const { container } = render(
      <ContentCard className="custom-card">
        <div>Custom content</div>
      </ContentCard>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ContentCard with column layout', () => {
    const { container } = render(
      <ContentCard layout="column">
        <div>Column layout content</div>
      </ContentCard>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ContentCard with image', () => {
    const image = {
      src: '/test.jpg',
      alt: 'Test image',
      width: 200,
      height: 200,
    };
    const { container } = render(
      <ContentCard image={image}>
        <div>Content with image</div>
      </ContentCard>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ContentContainer with default props', () => {
    const { container } = render(
      <ContentContainer>
        <div>Default container</div>
      </ContentContainer>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ContentContainer with small max width', () => {
    const { container } = render(
      <ContentContainer maxWidth="sm">
        <div>Small max width</div>
      </ContentContainer>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ContentContainer with large gap', () => {
    const { container } = render(
      <ContentContainer gap="lg">
        <div>Large gap</div>
      </ContentContainer>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ContentContainer with custom className', () => {
    const { container } = render(
      <ContentContainer className="custom-container">
        <div>Custom class</div>
      </ContentContainer>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ContentImage with default props', () => {
    const { container } = render(<ContentImage src="/test.jpg" alt="Test" width={100} height={100} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ContentImage visible on mobile', () => {
    const { container } = render(
      <ContentImage src="/test.jpg" alt="Test" width={100} height={100} hiddenOnMobile={false} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ContentImage with custom className', () => {
    const { container } = render(
      <ContentImage src="/test.jpg" alt="Test" width={100} height={100} className="custom-image" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ContentImage with custom container className', () => {
    const { container } = render(
      <ContentImage src="/test.jpg" alt="Test" width={100} height={100} containerClassName="custom-container" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
