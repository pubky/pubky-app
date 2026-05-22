import { render, screen } from '@testing-library/react';
import { Frown, Tag } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { IllustratedEmptyState } from './IllustratedEmptyState';

// Mock Next.js Image
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill,
    className,
    'aria-hidden': ariaHidden,
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    className?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
  }) => (
    <img
      src={src}
      alt={alt}
      data-fill={fill}
      className={className}
      aria-hidden={ariaHidden}
      data-testid="empty-state-image"
    />
  ),
}));

// Mock Container
vi.mock('@/atoms/Container/Container', () => ({
  Container: ({
    children,
    className,
    overrideDefaults,
  }: {
    children: React.ReactNode;
    className?: string;
    overrideDefaults?: boolean;
  }) => (
    <div className={className} data-override-defaults={overrideDefaults}>
      {children}
    </div>
  ),
}));

describe('IllustratedEmptyState', () => {
  it('renders image with correct src and alt', () => {
    render(
      <IllustratedEmptyState
        imageSrc="/test-image.png"
        imageAlt="Test image"
        icon={Frown}
        title="Test Title"
        subtitle="Test subtitle"
      />,
    );

    const image = screen.getByTestId('empty-state-image');
    expect(image).toHaveAttribute('src', '/test-image.png');
    expect(image).toHaveAttribute('alt', 'Test image');
  });

  it('renders icon', () => {
    const { container } = render(
      <IllustratedEmptyState imageSrc="/test.png" imageAlt="Test" icon={Frown} title="Title" subtitle="Subtitle" />,
    );

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('size-12');
    expect(icon).toHaveClass('text-brand');
  });

  it('renders title', () => {
    render(
      <IllustratedEmptyState
        imageSrc="/test.png"
        imageAlt="Test"
        icon={Frown}
        title="Test Title"
        subtitle="Subtitle"
      />,
    );

    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('renders subtitle as string', () => {
    render(
      <IllustratedEmptyState
        imageSrc="/test.png"
        imageAlt="Test"
        icon={Frown}
        title="Title"
        subtitle="Test subtitle"
      />,
    );

    expect(screen.getByText('Test subtitle')).toBeInTheDocument();
  });

  it('renders subtitle as ReactNode', () => {
    const { container } = render(
      <IllustratedEmptyState
        imageSrc="/test.png"
        imageAlt="Test"
        icon={Frown}
        title="Title"
        subtitle={
          <>
            Line 1
            <br />
            Line 2
          </>
        }
      />,
    );

    expect(container).toHaveTextContent('Line 1');
    expect(container).toHaveTextContent('Line 2');
    expect(container.querySelector('br')).toBeInTheDocument();
  });

  it('renders children when provided', () => {
    render(
      <IllustratedEmptyState imageSrc="/test.png" imageAlt="Test" icon={Frown} title="Title" subtitle="Subtitle">
        <div data-testid="child-content">Child content</div>
      </IllustratedEmptyState>,
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('does not render children container when children is not provided', () => {
    const { container } = render(
      <IllustratedEmptyState imageSrc="/test.png" imageAlt="Test" icon={Frown} title="Title" subtitle="Subtitle" />,
    );

    // Should have main container, icon container, and text container only
    const containers = container.querySelectorAll('div');
    expect(containers.length).toBe(3);
  });

  it('renders different icons correctly', () => {
    const { rerender, container } = render(
      <IllustratedEmptyState imageSrc="/test.png" imageAlt="Test" icon={Frown} title="Title" subtitle="Subtitle" />,
    );

    let icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();

    rerender(
      <IllustratedEmptyState imageSrc="/test.png" imageAlt="Test" icon={Tag} title="Title" subtitle="Subtitle" />,
    );

    icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });
});

describe('IllustratedEmptyState - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(
      <IllustratedEmptyState
        imageSrc="/images/test-empty-state.png"
        imageAlt="Test - Empty state"
        icon={Frown}
        title="No items found"
        subtitle="There are no items to display at this time."
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with ReactNode subtitle', () => {
    const { container } = render(
      <IllustratedEmptyState
        imageSrc="/images/test-empty-state.png"
        imageAlt="Test - Empty state"
        icon={Frown}
        title="No items found"
        subtitle={
          <>
            First line
            <br />
            Second line
          </>
        }
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with children', () => {
    const { container } = render(
      <IllustratedEmptyState
        imageSrc="/images/test-empty-state.png"
        imageAlt="Test - Empty state"
        icon={Frown}
        title="No items found"
        subtitle="There are no items to display."
      >
        <div data-testid="test-child">Child component</div>
      </IllustratedEmptyState>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with different icon', () => {
    const { container } = render(
      <IllustratedEmptyState
        imageSrc="/images/tagged-empty-state.webp"
        imageAlt="Tagged - Empty state"
        icon={Tag}
        title="No tags found"
        subtitle="You haven't been tagged yet."
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
