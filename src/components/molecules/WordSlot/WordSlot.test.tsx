import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WordSlot } from './WordSlot';

// Mock external dependencies

vi.mock('@/atoms/Badge/Badge', () => {
  return {
    Badge: vi.fn(({ children, variant, className }) => (
      <span data-testid="badge" data-variant={variant} className={className}>
        {children}
      </span>
    )),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: vi.fn(({ children, className, ...props }) => (
      <div data-testid="container" className={className} {...props}>
        {children}
      </div>
    )),
  };
});

vi.mock('@/atoms/Input/Input', () => {
  return {
    Input: vi.fn(({ value, placeholder, className, onChange, onBlur, disabled, readOnly, onClick, ...props }) => (
      <input
        data-testid="input"
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readOnly}
        onClick={onClick}
        {...props}
      />
    )),
  };
});

describe('WordSlot', () => {
  describe('Editable Mode', () => {
    const defaultEditableProps = {
      mode: 'editable' as const,
      index: 0,
      word: 'test',
      isError: false,
      showError: false,
      isRestoring: false,
      onChange: vi.fn(),
      onValidate: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('renders in editable mode with correct props', () => {
      render(<WordSlot {...defaultEditableProps} />);

      const badge = screen.getByTestId('badge');
      const input = screen.getByTestId('input');

      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('1'); // index + 1
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('test');
      expect(input).toHaveAttribute('placeholder', 'word');
    });

    it('handles onChange events correctly', () => {
      const mockOnChange = vi.fn();
      render(<WordSlot {...defaultEditableProps} onChange={mockOnChange} />);

      const input = screen.getByTestId('input');
      fireEvent.change(input, { target: { value: 'NEW WORD ' } });

      expect(mockOnChange).toHaveBeenCalledWith(0, 'new word');
    });

    it('handles onBlur events correctly', () => {
      const mockOnValidate = vi.fn();
      render(<WordSlot {...defaultEditableProps} onValidate={mockOnValidate} />);

      const input = screen.getByTestId('input');
      fireEvent.blur(input);

      expect(mockOnValidate).toHaveBeenCalledWith(0, 'test');
    });

    it('applies error styling when isError and showError are true', () => {
      render(<WordSlot {...defaultEditableProps} isError={true} showError={true} />);

      const containers = screen.getAllByTestId('container');

      // Check if the error class is applied (via className prop)
      expect(containers.some((container) => container.className?.includes('border-red-500'))).toBe(true);
    });

    it('disables input when isRestoring is true', () => {
      render(<WordSlot {...defaultEditableProps} isRestoring={true} />);

      const input = screen.getByTestId('input');
      expect(input).toBeDisabled();
    });

    it('does not apply error styling when showError is false', () => {
      render(<WordSlot {...defaultEditableProps} isError={true} showError={false} />);

      const containers = screen.getAllByTestId('container');

      // Check that error styling is not applied
      expect(containers.every((container) => !container.className?.includes('border-red-500'))).toBe(true);
    });
  });

  describe('Readonly Mode', () => {
    const defaultReadonlyProps = {
      mode: 'readonly' as const,
      index: 1,
      word: 'example',
      isCorrect: false,
      isError: false,
      onClear: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('renders in readonly mode with correct props', () => {
      render(<WordSlot {...defaultReadonlyProps} />);

      const badge = screen.getByTestId('badge');
      const input = screen.getByTestId('input');

      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('2'); // index + 1
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('example');
      expect(input).toHaveAttribute('readonly');
    });

    it('handles click events for clearing words', () => {
      const mockOnClear = vi.fn();
      render(<WordSlot {...defaultReadonlyProps} onClear={mockOnClear} />);

      const containers = screen.getAllByTestId('container');
      const clickableContainer = containers.find(
        (container) => container.getAttribute('title') === 'Click to remove this word',
      );

      expect(clickableContainer).toBeInTheDocument();

      if (clickableContainer) {
        fireEvent.click(clickableContainer);
        expect(mockOnClear).toHaveBeenCalledWith(1);
      }
    });

    it('handles input click events for clearing words', () => {
      const mockOnClear = vi.fn();
      render(<WordSlot {...defaultReadonlyProps} onClear={mockOnClear} />);

      const input = screen.getByTestId('input');
      fireEvent.click(input);

      expect(mockOnClear).toHaveBeenCalledWith(1);
    });

    it('does not trigger clear when word is empty', () => {
      const mockOnClear = vi.fn();
      render(<WordSlot {...defaultReadonlyProps} word="" onClear={mockOnClear} />);

      const containers = screen.getAllByTestId('container');
      containers.forEach((container) => {
        fireEvent.click(container);
      });

      expect(mockOnClear).not.toHaveBeenCalled();
    });

    it('applies correct styling when isCorrect is true', () => {
      render(<WordSlot {...defaultReadonlyProps} isCorrect={true} />);

      const containers = screen.getAllByTestId('container');
      const badge = screen.getByTestId('badge');
      const input = screen.getByTestId('input');

      // Check for correct styling classes
      expect(containers.some((container) => container.className?.includes('border-brand'))).toBe(true);

      expect(badge.className?.includes('bg-brand')).toBe(true);
      expect(input.className?.includes('!text-brand')).toBe(true);
    });

    it('applies error styling when isError is true', () => {
      render(<WordSlot {...defaultReadonlyProps} isError={true} />);

      const containers = screen.getAllByTestId('container');
      const badge = screen.getByTestId('badge');
      const input = screen.getByTestId('input');

      // Check for error styling classes
      expect(containers.some((container) => container.className?.includes('border-destructive'))).toBe(true);

      expect(badge.className?.includes('bg-destructive')).toBe(true);
      expect(input.className?.includes('!text-destructive')).toBe(true);
    });

    it('shows correct title attribute when word can be cleared', () => {
      render(<WordSlot {...defaultReadonlyProps} word="test" />);

      const containers = screen.getAllByTestId('container');
      const clickableContainer = containers.find(
        (container) => container.getAttribute('title') === 'Click to remove this word',
      );

      expect(clickableContainer).toBeInTheDocument();
    });

    it('does not show title attribute when word is empty', () => {
      render(<WordSlot {...defaultReadonlyProps} word="" />);

      const containers = screen.getAllByTestId('container');
      const clickableContainer = containers.find(
        (container) => container.getAttribute('title') === 'Click to remove this word',
      );

      expect(clickableContainer).toBeUndefined();
    });
  });

  describe('Badge Numbering', () => {
    it('displays correct badge number for different indices', () => {
      const { rerender } = render(
        <WordSlot
          mode="editable"
          index={5}
          word="test"
          isError={false}
          showError={false}
          isRestoring={false}
          onChange={vi.fn()}
          onValidate={vi.fn()}
        />,
      );

      expect(screen.getByTestId('badge')).toHaveTextContent('6'); // index + 1

      rerender(<WordSlot mode="readonly" index={11} word="test" isCorrect={true} isError={false} onClear={vi.fn()} />);

      expect(screen.getByTestId('badge')).toHaveTextContent('12'); // index + 1
    });
  });
});
