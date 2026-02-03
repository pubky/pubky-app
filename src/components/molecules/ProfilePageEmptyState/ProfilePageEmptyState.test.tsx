import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Frown, Tag } from 'lucide-react';
import { ProfilePageEmptyState } from './ProfilePageEmptyState';

// Mock Next.js Image
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img data-testid="image" src={src} alt={alt} />,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Frown: ({ className, strokeWidth }: { className?: string; strokeWidth?: number }) => (
    <svg data-testid="frown-icon" className={className} data-stroke-width={strokeWidth}>
      Frown
    </svg>
  ),
  Tag: ({ className, strokeWidth }: { className?: string; strokeWidth?: number }) => (
    <svg data-testid="tag-icon" className={className} data-stroke-width={strokeWidth}>
      Tag
    </svg>
  ),
}));

// Mock atoms
vi.mock('@/atoms', () => ({
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
}));

describe('ProfilePageEmptyState', () => {
  it('renders image with correct src and alt', () => {
    render(
      <ProfilePageEmptyState
        imageSrc="/test-image.png"
        imageAlt="Test image"
        icon={Frown}
        title="Test Title"
        subtitle="Test subtitle"
      />,
    );

    const image = screen.getByTestId('image');
    expect(image).toHaveAttribute('src', '/test-image.png');
    expect(image).toHaveAttribute('alt', 'Test image');
  });

  it('renders icon', () => {
    render(
      <ProfilePageEmptyState
        imageSrc="/test.png"
        imageAlt="Test"
        icon={Frown}
        title="Test Title"
        subtitle="Test subtitle"
      />,
    );

    const icon = screen.getByTestId('frown-icon');
    expect(icon).toBeInTheDocument();
  });

  it('renders title', () => {
    render(
      <ProfilePageEmptyState
        imageSrc="/test.png"
        imageAlt="Test"
        icon={Frown}
        title="Test Title"
        subtitle="Test subtitle"
      />,
    );

    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('renders subtitle as string', () => {
    render(
      <ProfilePageEmptyState
        imageSrc="/test.png"
        imageAlt="Test"
        icon={Frown}
        title="Test Title"
        subtitle="Test subtitle"
      />,
    );

    expect(screen.getByText('Test subtitle')).toBeInTheDocument();
  });

  it('renders subtitle as ReactNode', () => {
    const { container } = render(
      <ProfilePageEmptyState
        imageSrc="/test.png"
        imageAlt="Test"
        icon={Frown}
        title="Test Title"
        subtitle={
          <>
            Line 1
            <br />
            Line 2
          </>
        }
      />,
    );

    const subtitle = container.querySelector('[data-testid="typography"]:last-child');
    expect(subtitle).toBeInTheDocument();
    expect(subtitle?.textContent).toContain('Line 1');
    expect(subtitle?.textContent).toContain('Line 2');
  });

  it('renders children when provided', () => {
    render(
      <ProfilePageEmptyState
        imageSrc="/test.png"
        imageAlt="Test"
        icon={Tag}
        title="Test Title"
        subtitle="Test subtitle"
      >
        <div data-testid="child-content">Child content</div>
      </ProfilePageEmptyState>,
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('does not render children container when children is not provided', () => {
    const { container } = render(
      <ProfilePageEmptyState
        imageSrc="/test.png"
        imageAlt="Test"
        icon={Frown}
        title="Test Title"
        subtitle="Test subtitle"
      />,
    );

    const containers = container.querySelectorAll('[data-testid="container"]');
    // Should have 3 containers: outer, icon, and text (no children container)
    expect(containers.length).toBe(3);
  });

  it('renders different icons correctly', () => {
    const { rerender } = render(
      <ProfilePageEmptyState
        imageSrc="/test.png"
        imageAlt="Test"
        icon={Frown}
        title="Test Title"
        subtitle="Test subtitle"
      />,
    );

    expect(screen.getByTestId('frown-icon')).toBeInTheDocument();

    rerender(
      <ProfilePageEmptyState
        imageSrc="/test.png"
        imageAlt="Test"
        icon={Tag}
        title="Test Title"
        subtitle="Test subtitle"
      />,
    );

    expect(screen.getByTestId('tag-icon')).toBeInTheDocument();
  });
});

describe('ProfilePageEmptyState - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(
      <ProfilePageEmptyState
        imageSrc="/images/test-empty-state.png"
        imageAlt="Test - Empty state"
        icon={Frown}
        title="Nothing to see here"
        subtitle="This is a test subtitle"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with ReactNode subtitle', () => {
    const { container } = render(
      <ProfilePageEmptyState
        imageSrc="/images/test-empty-state.png"
        imageAlt="Test - Empty state"
        icon={Tag}
        title="Test Title"
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
      <ProfilePageEmptyState
        imageSrc="/images/test-empty-state.png"
        imageAlt="Test - Empty state"
        icon={Tag}
        title="Test Title"
        subtitle="Test subtitle"
      >
        <div data-testid="test-child">Child component</div>
      </ProfilePageEmptyState>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with different icon', () => {
    const { container } = render(
      <ProfilePageEmptyState
        imageSrc="/images/tagged-empty-state.webp"
        imageAlt="Tagged - Empty state"
        icon={Tag}
        title="Discover who tagged you"
        subtitle="No one has tagged you yet."
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
