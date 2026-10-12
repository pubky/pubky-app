import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImageBackground } from './ImageBackground';

describe('ImageBackground', () => {
  it('renders with default props', () => {
    render(<ImageBackground image="/bg-image.jpg" />);
    const imageBackground = screen.getByTestId('image-background');
    expect(imageBackground).toBeInTheDocument();
  });

  it('switches between single and dual background mode', () => {
    const { rerender } = render(<ImageBackground image="/bg.jpg" data-testid="image-background" />);

    // Initially single background
    let background = screen.getByTestId('image-background');
    expect(background).toBeInTheDocument();

    // Add mobileImage - should now render two backgrounds
    rerender(<ImageBackground image="/bg-desktop.jpg" mobileImage="/bg-mobile.jpg" data-testid="image-background" />);

    const backgrounds = screen.getAllByTestId('image-background');
    expect(backgrounds).toHaveLength(2);

    // Remove mobileImage - should go back to single background
    rerender(<ImageBackground image="/bg.jpg" data-testid="image-background" />);
    background = screen.getByTestId('image-background');
    expect(background).toBeInTheDocument();
  });
});
