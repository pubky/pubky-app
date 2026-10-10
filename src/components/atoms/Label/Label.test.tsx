import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Label } from './Label';

describe('Label', () => {
  it('renders with default props', () => {
    render(<Label>Default Label</Label>);
    expect(screen.getByText('Default Label')).toBeInTheDocument();
    expect(screen.getByText('Default Label')).toHaveAttribute('data-slot', 'label');
  });

  it('associates with a control via htmlFor', () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <input id="email" />
      </>,
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Label className="custom-label">Custom Label</Label>);
    expect(screen.getByText('Custom Label')).toHaveClass('custom-label');
  });
});
