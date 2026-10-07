import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('renders with default props', () => {
    render(<Textarea>Default Textarea</Textarea>);
    const textarea = screen.getByText('Default Textarea');
    expect(textarea).toBeInTheDocument();
  });

  it('handles onChange events', () => {
    const handleChange = vi.fn();
    render(<Textarea onChange={handleChange} data-testid="textarea" />);

    const textarea = screen.getByTestId('textarea');
    fireEvent.change(textarea, { target: { value: 'Hello World' } });

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('can be disabled', () => {
    render(<Textarea disabled data-testid="textarea" />);
    const textarea = screen.getByTestId('textarea');
    expect(textarea).toBeDisabled();
  });

  it('handles updating value', () => {
    const { rerender } = render(<Textarea value="Initial value" onChange={() => {}} data-testid="textarea" />);
    const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Initial value');

    rerender(<Textarea value="Updated value" onChange={() => {}} data-testid="textarea" />);
    expect(textarea.value).toBe('Updated value');
  });
});

describe('Textarea - Variants', () => {
  it('renders default variant with border and shadow classes', () => {
    const { container } = render(<Textarea data-testid="textarea" />);
    const textarea = container.firstChild as HTMLElement;
    expect(textarea.className).toContain('border');
    expect(textarea.className).toContain('shadow-xs');
    expect(textarea.className).toContain('min-h-16');
  });

  it('renders inline variant without border or shadow', () => {
    const { container } = render(<Textarea variant="inline" data-testid="textarea" />);
    const textarea = container.firstChild as HTMLElement;
    expect(textarea.className).toContain('border-none');
    expect(textarea.className).toContain('shadow-none');
    expect(textarea.className).toContain('min-h-6');
    expect(textarea.className).toContain('font-medium');
    expect(textarea.className).toContain('text-secondary-foreground');
  });

  it('allows className overrides on inline variant', () => {
    const { container } = render(<Textarea variant="inline" className="min-h-20 text-base" />);
    const textarea = container.firstChild as HTMLElement;
    expect(textarea.className).toContain('min-h-20');
    expect(textarea.className).toContain('text-base');
  });
});
