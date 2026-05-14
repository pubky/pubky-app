import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('accepts and displays value', () => {
    render(<Input data-testid="input" value="test value" onChange={() => {}} />);
    const input = screen.getByTestId('input') as HTMLInputElement;

    expect(input.value).toBe('test value');
  });

  it('handles disabled state', () => {
    render(<Input data-testid="input" disabled />);
    const input = screen.getByTestId('input');

    expect(input).toBeDisabled();
  });

  it('handles onClick events', () => {
    const handleClick = vi.fn();
    render(<Input data-testid="input" onClick={handleClick} />);
    const input = screen.getByTestId('input');

    fireEvent.click(input);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('handles onChange events', () => {
    const handleChange = vi.fn();
    render(<Input data-testid="input" onChange={handleChange} />);
    const input = screen.getByTestId('input');

    fireEvent.change(input, { target: { value: 'new value' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('handles onFocus and onBlur events', () => {
    const handleFocus = vi.fn();
    const handleBlur = vi.fn();
    render(<Input data-testid="input" onFocus={handleFocus} onBlur={handleBlur} />);
    const input = screen.getByTestId('input');

    fireEvent.focus(input);
    expect(handleFocus).toHaveBeenCalledTimes(1);

    fireEvent.blur(input);
    expect(handleBlur).toHaveBeenCalledTimes(1);
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<Input ref={ref} data-testid="input" />);

    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });
});

describe('Input - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Input />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Input className="custom-input" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with placeholder', () => {
    const { container } = render(<Input placeholder="Enter text" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for text type', () => {
    const { container } = render(<Input type="text" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for email type', () => {
    const { container } = render(<Input type="email" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for password type', () => {
    const { container } = render(<Input type="password" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for disabled state', () => {
    const { container } = render(<Input disabled />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for required state', () => {
    const { container } = render(<Input required />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for readOnly state', () => {
    const { container } = render(<Input readOnly />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshots for standard input attributes', () => {
    const { container } = render(
      <Input
        data-testid="input"
        id="test-input"
        name="testName"
        required
        maxLength={100}
        minLength={5}
        pattern="[a-z]+"
        autoComplete="off"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
