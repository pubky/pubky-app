import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Image } from './Image';

describe('Image', () => {
  it('renders with required props', () => {
    render(<Image src="/test-image.jpg" alt="Test image" data-testid="test-image" />);
    const image = screen.getByTestId('test-image');
    expect(image).toBeInTheDocument();
  });

  it('renders with correct src and alt attributes', () => {
    render(<Image src="/photo.jpg" alt="A beautiful photo" data-testid="photo" />);
    const image = screen.getByTestId('photo') as HTMLImageElement;
    expect(image.src).toContain('/photo.jpg');
    expect(image.alt).toBe('A beautiful photo');
  });

  it('applies custom className', () => {
    render(<Image src="/image.jpg" alt="Image" className="custom-class" data-testid="custom-image" />);
    const image = screen.getByTestId('custom-image');
    expect(image).toHaveClass('custom-class');
  });

  it('applies default classes', () => {
    render(<Image src="/image.jpg" alt="Image" data-testid="default-image" />);
    const image = screen.getByTestId('default-image');
    expect(image).toHaveClass('h-auto', 'max-w-full');
  });

  it('accepts additional HTML img attributes', () => {
    render(<Image src="/image.jpg" alt="Image" width={200} height={150} loading="lazy" data-testid="img-with-attrs" />);
    const image = screen.getByTestId('img-with-attrs') as HTMLImageElement;
    expect(image.width).toBe(200);
    expect(image.height).toBe(150);
    expect(image.getAttribute('loading')).toBe('lazy');
  });
});

describe('Image - Snapshots', () => {
  it('matches snapshot with required props', () => {
    const { container } = render(<Image src="/image.jpg" alt="Test image" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Image src="/image.jpg" alt="Image" className="rounded-full border-2" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with JPG image', () => {
    const { container } = render(<Image src="/photo.jpg" alt="JPG photo" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with PNG image', () => {
    const { container } = render(<Image src="/graphic.png" alt="PNG graphic" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with SVG image', () => {
    const { container } = render(<Image src="/icon.svg" alt="SVG icon" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with WebP image', () => {
    const { container } = render(<Image src="/modern.webp" alt="WebP image" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with width and height attributes', () => {
    const { container } = render(<Image src="/sized.jpg" alt="Sized image" width={300} height={200} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with loading attribute', () => {
    const { container } = render(<Image src="/lazy.jpg" alt="Lazy loaded" loading="lazy" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with id prop', () => {
    const { container } = render(<Image src="/image.jpg" alt="Image" id="hero-image" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with data-testid prop', () => {
    const { container } = render(<Image src="/image.jpg" alt="Image" data-testid="custom-test-id" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with title attribute', () => {
    const { container } = render(<Image src="/image.jpg" alt="Image" title="Image tooltip" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple custom attributes', () => {
    const { container } = render(
      <Image
        src="/complex.jpg"
        alt="Complex image"
        className="rounded-lg shadow-md"
        width={400}
        height={300}
        loading="lazy"
        title="A complex image"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
