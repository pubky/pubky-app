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

describe('ImageBackground - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<ImageBackground image="/bg-image.jpg" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<ImageBackground image="/custom-bg.jpg" className="custom-bg" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with JPG image', () => {
    const { container } = render(<ImageBackground image="/background.jpg" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with PNG image', () => {
    const { container } = render(<ImageBackground image="/background.png" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with SVG image', () => {
    const { container } = render(<ImageBackground image="/background.svg" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with id prop', () => {
    const { container } = render(<ImageBackground image="/bg.jpg" id="background-id" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with data-testid prop', () => {
    const { container } = render(<ImageBackground image="/bg.jpg" data-testid="custom-bg" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshots for image and mobileImages props', () => {
    const { container: withImageContainer } = render(
      <ImageBackground image="/bg.jpg" mobileImage="/bg-mobile.jpg" className="custom-bg" />,
    );
    expect(withImageContainer.firstChild).toMatchSnapshot();
  });
});
