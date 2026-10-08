import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TextareaField } from './TextareaField';

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Textarea/Textarea', () => {
  return {
    Textarea: ({
      className,
      value,
      onChange,
      placeholder,
      rows,
      disabled,
      readOnly,
      onClick,
      maxLength,
      ...props
    }: {
      className?: string;
      value?: string;
      onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
      placeholder?: string;
      rows?: number;
      disabled?: boolean;
      readOnly?: boolean;
      onClick?: () => void;
      maxLength?: number;
      [key: string]: unknown;
    }) => (
      <textarea
        data-testid="textarea"
        className={className}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        readOnly={readOnly}
        onClick={onClick}
        maxLength={maxLength}
        {...props}
      />
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="typography" className={className}>
        {children}
      </div>
    ),
  };
});

describe('TextareaField', () => {
  it('renders with required value prop', () => {
    render(<TextareaField value="Test content" />);
    expect(screen.getByTestId('container')).toBeInTheDocument();
    expect(screen.getByTestId('textarea')).toBeInTheDocument();
    const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Test content');
  });

  it('handles onClick events', () => {
    const handleClick = vi.fn();
    render(<TextareaField value="" onClick={handleClick} />);

    const textarea = screen.getByTestId('textarea');
    fireEvent.click(textarea);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('handles onChange events with new content', () => {
    const handleChange = vi.fn();
    render(<TextareaField value="" onChange={handleChange} />);

    const textarea = screen.getByTestId('textarea');
    fireEvent.change(textarea, { target: { value: 'New content' } });

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('handles disabled state', () => {
    render(<TextareaField value="" disabled />);

    const textarea = screen.getByTestId('textarea');
    expect(textarea).toBeDisabled();
  });

  it('renders the default variant with a solid border', () => {
    render(<TextareaField value="" />);

    const container = screen.getByTestId('container');
    expect(container).toHaveClass('border', 'border-input');
    expect(container).not.toHaveClass('border-dashed');
    expect(screen.getByTestId('textarea')).toHaveAttribute('aria-invalid', 'false');
  });

  it('renders the dashed variant', () => {
    render(<TextareaField value="" variant="dashed" />);
    expect(screen.getByTestId('container')).toHaveClass('border-dashed');
  });

  it.each([
    ['success', ['border-brand', 'text-brand']],
    ['error', ['border-red-500', 'text-red-500']],
  ] as const)('applies status=%s classes', (status, classNames) => {
    render(<TextareaField value="" status={status} />);
    expect(screen.getByTestId('container')).toHaveClass(...classNames);
    expect(screen.getByTestId('textarea')).toHaveAttribute('aria-invalid', status === 'error' ? 'true' : 'false');
  });

  it('passes readOnly, rows and maxLength to the textarea', () => {
    render(<TextareaField value="" readOnly rows={6} maxLength={120} />);

    const textarea = screen.getByTestId('textarea');
    expect(textarea).toHaveAttribute('readonly');
    expect(textarea).toHaveAttribute('rows', '6');
    expect(textarea).toHaveAttribute('maxlength', '120');
  });

  it.each([
    ['default', 'text-muted-foreground'],
    ['info', 'text-blue-500'],
    ['alert', 'text-yellow-500'],
    ['error', 'text-red-500'],
    ['success', 'text-brand'],
  ] as const)('styles the message for messageType=%s', (messageType, className) => {
    render(<TextareaField value="" message="Hint" messageType={messageType} />);
    expect(screen.getByTestId('typography')).toHaveClass(className);
    expect(screen.getByTestId('typography')).toHaveTextContent('Hint');
  });

  it('does not render a message element without a message', () => {
    render(<TextareaField value="" />);
    expect(screen.queryByTestId('typography')).not.toBeInTheDocument();
  });

  it('handles onKeyDown events', () => {
    const handleKeyDown = vi.fn();
    render(<TextareaField value="" onKeyDown={handleKeyDown} />);

    const textarea = screen.getByTestId('textarea');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(handleKeyDown).toHaveBeenCalledTimes(1);
    expect(handleKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: 'Enter' }));
  });

  it('passes through onKeyDown with proper event type', () => {
    const handleKeyDown = vi.fn((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Verify we receive the proper event type with textarea-specific properties
      expect(e.currentTarget).toBeInstanceOf(HTMLTextAreaElement);
    });

    render(<TextareaField value="test" onKeyDown={handleKeyDown} />);

    const textarea = screen.getByTestId('textarea');
    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(handleKeyDown).toHaveBeenCalledTimes(1);
  });
});
