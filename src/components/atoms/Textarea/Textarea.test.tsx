import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('Textarea - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Textarea />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Textarea className="custom-textarea" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with placeholder', () => {
    const { container } = render(<Textarea placeholder="Enter text" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for disabled state', () => {
    const { container } = render(<Textarea disabled />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for invalid state', () => {
    const { container } = render(<Textarea aria-invalid />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for readOnly state', () => {
    const { container } = render(<Textarea readOnly />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with value prop', () => {
    const { container } = render(<Textarea value="Initial value" onChange={() => {}} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with defaultValue prop', () => {
    const { container } = render(<Textarea defaultValue="Default text" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom rows', () => {
    const { container } = render(<Textarea rows={5} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with resize-none className', () => {
    const { container } = render(<Textarea className="resize-none" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with id prop', () => {
    const { container } = render(<Textarea id="textarea-id" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with data-testid prop', () => {
    const { container } = render(<Textarea data-testid="custom-textarea" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with name prop', () => {
    const { container } = render(<Textarea name="textarea-name" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for inline variant', () => {
    const { container } = render(<Textarea variant="inline" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for inline variant with custom className', () => {
    const { container } = render(<Textarea variant="inline" className="min-h-20 text-base" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
