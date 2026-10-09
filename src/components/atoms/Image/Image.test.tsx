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
