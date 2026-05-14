import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Link } from './Link';

describe('Link', () => {
  it('renders with default props', () => {
    render(<Link href="https://example.com">Default Link</Link>);
    const link = screen.getByText('Default Link');
    expect(link).toBeInTheDocument();
  });

  describe('External Links', () => {
    it('renders as <a> tag for external URLs starting with https://', () => {
      render(<Link href="https://example.com">External Link</Link>);
      const link = screen.getByText('External Link');
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders as <a> tag for external URLs starting with http://', () => {
      render(<Link href="http://example.com">External Link</Link>);
      const link = screen.getByText('External Link');
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders as <a> tag for protocol-relative URLs', () => {
      render(<Link href="//example.com">Protocol Relative Link</Link>);
      const link = screen.getByText('Protocol Relative Link');
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('target', '_blank');
    });
  });

  describe('Internal Links', () => {
    it('renders as Next.js Link for internal paths', () => {
      render(<Link href="/about">Internal Link</Link>);
      const link = screen.getByText('Internal Link');
      expect(link.tagName).toBe('A');
      expect(link).not.toHaveAttribute('target', '_blank');
      expect(link).not.toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders as Next.js Link for root path', () => {
      render(<Link href="/">Home</Link>);
      const link = screen.getByText('Home');
      expect(link.tagName).toBe('A');
      expect(link).not.toHaveAttribute('target', '_blank');
    });

    it('renders as Next.js Link for paths with query params', () => {
      render(<Link href="/search?q=test">Search</Link>);
      const link = screen.getByText('Search');
      expect(link).not.toHaveAttribute('target', '_blank');
    });
  });

  describe('Escape Hatch - Override Default Behavior', () => {
    it('allows overriding target for external links', () => {
      render(
        <Link href="https://example.com" target="_self">
          Same Tab Link
        </Link>,
      );
      const link = screen.getByText('Same Tab Link');
      expect(link).toHaveAttribute('target', '_self');
    });

    it('allows overriding rel for external links', () => {
      render(
        <Link href="https://example.com" rel="nofollow">
          No Follow Link
        </Link>,
      );
      const link = screen.getByText('No Follow Link');
      expect(link).toHaveAttribute('rel', 'nofollow');
    });

    it('allows overriding both target and rel', () => {
      render(
        <Link href="https://example.com" target="_self" rel="nofollow noopener">
          Custom Link
        </Link>,
      );
      const link = screen.getByText('Custom Link');
      expect(link).toHaveAttribute('target', '_self');
      expect(link).toHaveAttribute('rel', 'nofollow noopener');
    });

    it('maintains security defaults when not overridden', () => {
      render(<Link href="https://example.com">Default Security</Link>);
      const link = screen.getByText('Default Security');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('overrideDefaults Prop', () => {
    it('applies default variant classes when overrideDefaults is false (default)', () => {
      render(<Link href="https://example.com">Default Styling</Link>);
      const link = screen.getByText('Default Styling');
      expect(link).toHaveClass('text-brand');
      expect(link).toHaveClass('cursor-pointer');
      expect(link).toHaveClass('text-sm');
    });

    it('does not apply default variant classes when overrideDefaults is true', () => {
      render(
        <Link href="https://example.com" overrideDefaults>
          No Default Styling
        </Link>,
      );
      const link = screen.getByText('No Default Styling');
      expect(link).not.toHaveClass('text-brand');
      expect(link).not.toHaveClass('cursor-pointer');
      expect(link).not.toHaveClass('text-sm');
    });

    it('uses only custom className when overrideDefaults is true', () => {
      render(
        <Link href="https://example.com" overrideDefaults className="custom-only-class">
          Custom Only
        </Link>,
      );
      const link = screen.getByText('Custom Only');
      expect(link).toHaveClass('custom-only-class');
      expect(link).not.toHaveClass('text-brand');
      expect(link).not.toHaveClass('cursor-pointer');
    });

    it('ignores variant and size props when overrideDefaults is true', () => {
      render(
        <Link href="https://example.com" overrideDefaults variant="muted" size="lg" className="my-class">
          Ignored Variants
        </Link>,
      );
      const link = screen.getByText('Ignored Variants');
      expect(link).toHaveClass('my-class');
      expect(link).not.toHaveClass('text-muted-foreground');
      expect(link).not.toHaveClass('text-lg');
    });

    it('works with internal links when overrideDefaults is true', () => {
      render(
        <Link href="/about" overrideDefaults className="internal-custom">
          Internal Override
        </Link>,
      );
      const link = screen.getByText('Internal Override');
      expect(link).toHaveClass('internal-custom');
      expect(link).not.toHaveClass('text-brand');
      expect(link).not.toHaveAttribute('target', '_blank');
    });

    it('still applies external link attributes when overrideDefaults is true', () => {
      render(
        <Link href="https://example.com" overrideDefaults>
          External Override
        </Link>,
      );
      const link = screen.getByText('External Override');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('className Merging', () => {
    it('merges custom className with default variant classes', () => {
      render(
        <Link href="https://example.com" className="custom-class">
          Merged Classes Link
        </Link>,
      );
      const link = screen.getByText('Merged Classes Link');
      expect(link).toHaveClass('custom-class');
      expect(link).toHaveClass('text-brand');
      expect(link).toHaveClass('cursor-pointer');
    });

    it('allows custom className to override default classes via Tailwind merge', () => {
      render(
        <Link href="https://example.com" className="text-red-500">
          Override Classes Link
        </Link>,
      );
      const link = screen.getByText('Override Classes Link');
      expect(link).toHaveClass('text-red-500');
      expect(link).not.toHaveClass('text-brand');
    });

    it('merges className with variant and size classes', () => {
      render(
        <Link href="https://example.com" variant="muted" size="lg" className="font-bold">
          Combined Classes Link
        </Link>,
      );
      const link = screen.getByText('Combined Classes Link');
      expect(link).toHaveClass('font-bold');
      expect(link).toHaveClass('text-muted-foreground');
      expect(link).toHaveClass('text-lg');
    });

    it('merges className for internal links', () => {
      render(
        <Link href="/about" className="underline">
          Internal Merged Link
        </Link>,
      );
      const link = screen.getByText('Internal Merged Link');
      expect(link).toHaveClass('underline');
      expect(link).toHaveClass('cursor-pointer');
    });
  });
});

describe('Link - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(
      <Link href="https://example.com">
        <span>Default Link</span>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for default variant', () => {
    const { container } = render(
      <Link href="https://example.com" variant="default">
        <span>Default Variant</span>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for muted variant', () => {
    const { container } = render(
      <Link href="https://example.com" variant="muted">
        <span>Muted Variant</span>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for default size', () => {
    const { container } = render(
      <Link href="https://example.com" size="default">
        <span>Default Size</span>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for large size', () => {
    const { container } = render(
      <Link href="https://example.com" size="lg">
        <span>Large Size</span>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for extra large size', () => {
    const { container } = render(
      <Link href="https://example.com" size="xl">
        <span>Extra Large Size</span>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for HTTP link', () => {
    const { container } = render(
      <Link href="https://example.com">
        <span>HTTP Link</span>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for email link', () => {
    const { container } = render(
      <Link href="mailto:test@example.com">
        <span>Email Link</span>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for phone link', () => {
    const { container } = render(
      <Link href="tel:+1234567890">
        <span>Phone Link</span>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with text children', () => {
    const { container } = render(
      <Link href="https://example.com">
        <span>Text Link</span>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with SVG children', () => {
    const { container } = render(
      <Link href="https://example.com">
        <svg data-testid="svg-icon">
          <circle cx="50" cy="50" r="40" />
        </svg>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with image children', () => {
    const { container } = render(
      <Link href="https://example.com">
        <img src="/icon.png" alt="Icon" />
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with combined props', () => {
    const { container } = render(
      <Link href="https://example.com" variant="muted" size="lg" className="custom-class">
        <span>Combined Props Link</span>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with overrideDefaults true', () => {
    const { container } = render(
      <Link href="https://example.com" overrideDefaults className="custom-override-class">
        <span>Override Defaults Link</span>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with overrideDefaults true and no className', () => {
    const { container } = render(
      <Link href="https://example.com" overrideDefaults>
        <span>No Class Override Link</span>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with overrideDefaults true for internal link', () => {
    const { container } = render(
      <Link href="/about" overrideDefaults className="internal-override">
        <span>Internal Override Link</span>
      </Link>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
