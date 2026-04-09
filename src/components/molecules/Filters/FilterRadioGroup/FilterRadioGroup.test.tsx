import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterRadioGroup } from './FilterRadioGroup';

// Mock icon components for testing
const MockIcon1 = () => <svg data-testid="mock-icon-1" />;
const MockIcon2 = () => <svg data-testid="mock-icon-2" />;
const MockIcon3 = () => <svg data-testid="mock-icon-3" />;

const mockItems = [
  { key: 'option1', label: 'Option 1', icon: MockIcon1 },
  { key: 'option2', label: 'Option 2', icon: MockIcon2 },
  { key: 'option3', label: 'Option 3', icon: MockIcon3 },
];

const mockItemsWithDisabled = [
  { key: 'option1', label: 'Option 1', icon: MockIcon1 },
  { key: 'option2', label: 'Option 2', icon: MockIcon2, disabled: true },
  { key: 'option3', label: 'Option 3', icon: MockIcon3 },
];

describe('FilterRadioGroup', () => {
  it('renders with title and items', () => {
    render(<FilterRadioGroup title="Test Filter" items={mockItems} />);

    expect(screen.getByText('Test Filter')).toBeInTheDocument();
    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    expect(screen.getByText('Option 3')).toBeInTheDocument();
  });

  it('generates default testId from title', () => {
    render(<FilterRadioGroup title="My Custom Filter" items={mockItems} />);

    expect(screen.getByTestId('filter-my custom filter-radiogroup')).toBeInTheDocument();
  });

  it('selects first item by default when no defaultValue provided', () => {
    render(<FilterRadioGroup title="Test Filter" items={mockItems} />);

    const option1 = screen.getByLabelText('Option 1');
    expect(option1).toHaveAttribute('aria-checked', 'true');
    expect(option1).toHaveAttribute('tabIndex', '0');
  });

  it('respects defaultValue prop', () => {
    render(<FilterRadioGroup title="Test Filter" items={mockItems} defaultValue="option2" />);

    const option2 = screen.getByLabelText('Option 2');
    expect(option2).toHaveAttribute('aria-checked', 'true');
    expect(option2).toHaveAttribute('tabIndex', '0');
  });

  it('calls onChange when item is clicked', () => {
    const mockOnChange = vi.fn();
    render(<FilterRadioGroup title="Test Filter" items={mockItems} onChange={mockOnChange} />);

    const option2 = screen.getByLabelText('Option 2');
    fireEvent.click(option2);

    expect(mockOnChange).toHaveBeenCalledWith('option2');
  });

  it('updates selection on click in uncontrolled mode', () => {
    render(<FilterRadioGroup title="Test Filter" items={mockItems} defaultValue="option1" />);

    const option1 = screen.getByLabelText('Option 1');
    const option2 = screen.getByLabelText('Option 2');

    expect(option1).toHaveAttribute('aria-checked', 'true');
    expect(option2).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(option2);

    expect(option1).toHaveAttribute('aria-checked', 'false');
    expect(option2).toHaveAttribute('aria-checked', 'true');
  });

  it('works in controlled mode', () => {
    const mockOnChange = vi.fn();
    const { rerender } = render(
      <FilterRadioGroup title="Test Filter" items={mockItems} selectedValue="option1" onChange={mockOnChange} />,
    );

    const option1 = screen.getByLabelText('Option 1');
    const option2 = screen.getByLabelText('Option 2');

    expect(option1).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(option2);
    expect(mockOnChange).toHaveBeenCalledWith('option2');

    // In controlled mode, parent updates the prop
    rerender(
      <FilterRadioGroup title="Test Filter" items={mockItems} selectedValue="option2" onChange={mockOnChange} />,
    );

    expect(option2).toHaveAttribute('aria-checked', 'true');
    expect(option1).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onClose when item is clicked', () => {
    const mockOnClose = vi.fn();
    render(<FilterRadioGroup title="Test Filter" items={mockItems} onClose={mockOnClose} />);

    const option2 = screen.getByLabelText('Option 2');
    fireEvent.click(option2);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  describe('Disabled items', () => {
    it('renders disabled items with proper styling', () => {
      render(<FilterRadioGroup title="Test Filter" items={mockItemsWithDisabled} />);

      const option2 = screen.getByLabelText('Option 2');
      expect(option2).toHaveAttribute('aria-disabled', 'true');
      expect(option2).toHaveClass('opacity-40', 'cursor-default');
    });

    it('does not call onChange when disabled item is clicked', () => {
      const mockOnChange = vi.fn();
      render(<FilterRadioGroup title="Test Filter" items={mockItemsWithDisabled} onChange={mockOnChange} />);

      const option2 = screen.getByLabelText('Option 2');
      fireEvent.click(option2);

      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('does not select disabled item', () => {
      render(<FilterRadioGroup title="Test Filter" items={mockItemsWithDisabled} defaultValue="option1" />);

      const option1 = screen.getByLabelText('Option 1');
      const option2 = screen.getByLabelText('Option 2');

      expect(option1).toHaveAttribute('aria-checked', 'true');

      fireEvent.click(option2);

      // Should still be on option1
      expect(option1).toHaveAttribute('aria-checked', 'true');
      expect(option2).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('Keyboard navigation', () => {
    it('handles ArrowDown navigation', () => {
      render(<FilterRadioGroup title="Test Filter" items={mockItems} defaultValue="option1" />);

      const option1 = screen.getByLabelText('Option 1');
      const option2 = screen.getByLabelText('Option 2');

      option1.focus();
      fireEvent.keyDown(option1, { key: 'ArrowDown' });

      expect(document.activeElement).toBe(option2);
    });

    it('handles ArrowUp navigation', () => {
      render(<FilterRadioGroup title="Test Filter" items={mockItems} defaultValue="option2" />);

      const option1 = screen.getByLabelText('Option 1');
      const option2 = screen.getByLabelText('Option 2');

      option2.focus();
      fireEvent.keyDown(option2, { key: 'ArrowUp' });

      expect(document.activeElement).toBe(option1);
    });

    it('handles Home key', () => {
      render(<FilterRadioGroup title="Test Filter" items={mockItems} defaultValue="option3" />);

      const option1 = screen.getByLabelText('Option 1');
      const option3 = screen.getByLabelText('Option 3');

      option3.focus();
      fireEvent.keyDown(option3, { key: 'Home' });

      expect(document.activeElement).toBe(option1);
    });

    it('handles End key', () => {
      render(<FilterRadioGroup title="Test Filter" items={mockItems} defaultValue="option1" />);

      const option1 = screen.getByLabelText('Option 1');
      const option3 = screen.getByLabelText('Option 3');

      option1.focus();
      fireEvent.keyDown(option1, { key: 'End' });

      expect(document.activeElement).toBe(option3);
    });

    it('selects item with Space key', () => {
      const mockOnChange = vi.fn();
      render(<FilterRadioGroup title="Test Filter" items={mockItems} onChange={mockOnChange} />);

      const option2 = screen.getByLabelText('Option 2');
      option2.focus();
      fireEvent.keyDown(option2, { key: ' ' });

      expect(mockOnChange).toHaveBeenCalledWith('option2');
    });

    it('selects item with Enter key', () => {
      const mockOnChange = vi.fn();
      render(<FilterRadioGroup title="Test Filter" items={mockItems} onChange={mockOnChange} />);

      const option2 = screen.getByLabelText('Option 2');
      option2.focus();
      fireEvent.keyDown(option2, { key: 'Enter' });

      expect(mockOnChange).toHaveBeenCalledWith('option2');
    });

    it('calls onClose when selecting with keyboard', () => {
      const mockOnClose = vi.fn();
      render(<FilterRadioGroup title="Test Filter" items={mockItems} onClose={mockOnClose} />);

      const option2 = screen.getByLabelText('Option 2');
      option2.focus();
      fireEvent.keyDown(option2, { key: 'Enter' });

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('skips disabled items when navigating with keyboard', () => {
      render(<FilterRadioGroup title="Test Filter" items={mockItemsWithDisabled} defaultValue="option1" />);

      const option1 = screen.getByLabelText('Option 1');
      const option3 = screen.getByLabelText('Option 3');

      option1.focus();
      fireEvent.keyDown(option1, { key: 'ArrowDown' });

      // Should skip option2 (disabled) and focus option3
      expect(document.activeElement).toBe(option3);
    });
  });

  describe('TabIndex management', () => {
    it('sets tabIndex 0 for selected item and -1 for others', () => {
      render(<FilterRadioGroup title="Test Filter" items={mockItems} defaultValue="option2" />);

      const option1 = screen.getByLabelText('Option 1');
      const option2 = screen.getByLabelText('Option 2');
      const option3 = screen.getByLabelText('Option 3');

      expect(option1).toHaveAttribute('tabIndex', '-1');
      expect(option2).toHaveAttribute('tabIndex', '0');
      expect(option3).toHaveAttribute('tabIndex', '-1');
    });

    it('updates tabIndex when selection changes', () => {
      render(<FilterRadioGroup title="Test Filter" items={mockItems} defaultValue="option1" />);

      const option1 = screen.getByLabelText('Option 1');
      const option2 = screen.getByLabelText('Option 2');

      expect(option1).toHaveAttribute('tabIndex', '0');
      expect(option2).toHaveAttribute('tabIndex', '-1');

      fireEvent.click(option2);

      expect(option1).toHaveAttribute('tabIndex', '-1');
      expect(option2).toHaveAttribute('tabIndex', '0');
    });
  });
});

describe('FilterRadioGroup - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<FilterRadioGroup title="Test Filter" items={mockItems} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with selected value', () => {
    const { container } = render(<FilterRadioGroup title="Test Filter" items={mockItems} selectedValue="option2" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with disabled item', () => {
    const { container } = render(<FilterRadioGroup title="Test Filter" items={mockItemsWithDisabled} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with default value', () => {
    const { container } = render(<FilterRadioGroup title="Test Filter" items={mockItems} defaultValue="option1" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
