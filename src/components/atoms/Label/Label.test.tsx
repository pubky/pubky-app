import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Label } from './Label';

describe('Label', () => {
  it('renders with default props', () => {
    render(<Label>Default Label</Label>);
    const label = screen.getByText('Default Label');
    expect(label).toBeInTheDocument();
  });
});

describe('Label - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Label>Default Label</Label>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Label className="custom-label">Custom Label</Label>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with htmlFor prop', () => {
    const { container } = render(<Label htmlFor="test-input">Form Label</Label>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with complex children', () => {
    const { container } = render(
      <Label>
        <span>Complex Label</span>
      </Label>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for form association', () => {
    const { container } = render(
      <div>
        <Label htmlFor="username">Username</Label>
        <input id="username" type="text" />
      </div>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
