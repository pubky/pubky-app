import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Iframe } from './Iframe';

describe('Iframe', () => {
  it('renders with required props', () => {
    render(<Iframe src="https://example.com/embed" title="Example embed" />);
    const iframe = screen.getByTestId('iframe');

    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', 'https://example.com/embed');
    expect(iframe).toHaveAttribute('title', 'Example embed');
    expect(iframe).toHaveAttribute('width', '100%');
    expect(iframe).toHaveAttribute('height', '315');
  });

  it('merges custom className with default classes', () => {
    render(<Iframe src="https://example.com/embed" title="Example embed" className="custom-class" />);
    const iframe = screen.getByTestId('iframe');

    expect(iframe).toHaveClass('rounded-md');
    expect(iframe).toHaveClass('custom-class');
  });

  it('has lazy loading by default', () => {
    render(<Iframe src="https://example.com/embed" title="Example embed" />);
    const iframe = screen.getByTestId('iframe');

    expect(iframe).toHaveAttribute('loading', 'lazy');
  });

  it('has allowFullScreen by default', () => {
    render(<Iframe src="https://example.com/embed" title="Example embed" />);
    const iframe = screen.getByTestId('iframe');

    expect(iframe).toHaveAttribute('allowFullScreen');
  });

  it('forwards ref to iframe element', () => {
    const ref = createRef<HTMLIFrameElement>();
    render(<Iframe ref={ref} src="https://example.com/embed" title="Example embed" />);

    expect(ref.current).toBeInstanceOf(HTMLIFrameElement);
    expect(ref.current).toHaveAttribute('src', 'https://example.com/embed');
  });

  it('accepts additional iframe props', () => {
    render(
      <Iframe
        src="https://example.com/embed"
        title="Example embed"
        width="640"
        height="360"
        allow="accelerometer; autoplay"
        sandbox="allow-scripts allow-same-origin"
      />,
    );
    const iframe = screen.getByTestId('iframe');

    expect(iframe).toHaveAttribute('width', '640');
    expect(iframe).toHaveAttribute('height', '360');
    expect(iframe).toHaveAttribute('allow', 'accelerometer; autoplay');
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
  });

  it('supports custom data-testid override', () => {
    render(<Iframe src="https://example.com/embed" title="Example embed" data-testid="custom-iframe" />);
    const iframe = screen.getByTestId('custom-iframe');

    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', 'https://example.com/embed');
  });
});

describe('Iframe - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Iframe src="https://example.com/embed" title="Example embed" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom props', () => {
    const { container } = render(
      <Iframe
        src="https://example.com/embed"
        title="Example embed"
        className="custom-class"
        width="640"
        height="360"
        allow="accelerometer; autoplay"
        sandbox="allow-scripts allow-same-origin"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
