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
