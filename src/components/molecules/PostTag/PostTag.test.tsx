import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostTag } from './PostTag';

describe('PostTag', () => {
  it('calls onClick when tag is clicked', () => {
    const mockOnClick = vi.fn();
    render(<PostTag label="bitcoin" onClick={mockOnClick} />);

    const tag = screen.getByRole('button');
    fireEvent.click(tag);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked', () => {
    const mockOnClose = vi.fn();
    render(<PostTag label="bitcoin" showClose onClose={mockOnClose} />);

    const closeButton = screen.getByLabelText(/remove bitcoin tag/i);
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('suppresses navigation (preventDefault + stopPropagation) on click, while still calling onClick', () => {
    const mockOnClick = vi.fn();
    render(<PostTag label="bitcoin" onClick={mockOnClick} />);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(clickEvent, 'preventDefault');
    const stopPropagation = vi.spyOn(clickEvent, 'stopPropagation');
    screen.getByRole('button').dispatchEvent(clickEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('suppresses navigation on close, while still calling onClose', () => {
    const mockOnClose = vi.fn();
    render(<PostTag label="bitcoin" showClose onClose={mockOnClose} />);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(clickEvent, 'preventDefault');
    const stopPropagation = vi.spyOn(clickEvent, 'stopPropagation');
    screen.getByLabelText(/remove bitcoin tag/i).dispatchEvent(clickEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when close button is clicked', () => {
    const mockOnClick = vi.fn();
    const mockOnClose = vi.fn();
    render(<PostTag label="bitcoin" showClose onClick={mockOnClick} onClose={mockOnClose} />);

    const closeButton = screen.getByLabelText(/remove bitcoin tag/i);
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('updates aria-label when count is provided', () => {
    const { rerender } = render(<PostTag label="bitcoin" />);
    expect(screen.getByLabelText(/bitcoin tag$/i)).toBeInTheDocument();

    rerender(<PostTag label="bitcoin" count={16} />);
    expect(screen.getByLabelText(/bitcoin tag \(16 posts\)/i)).toBeInTheDocument();
  });

  it('preserves post-tag count selector for e2e tests', () => {
    render(<PostTag label="bitcoin" count={16} />);
    expect(screen.getByText('16')).toHaveAttribute('data-cy', 'post-tag-count');
  });

  it('preserves post-tag remove selector for e2e tests', () => {
    render(<PostTag label="bitcoin" showClose />);
    expect(screen.getByLabelText(/remove bitcoin tag/i)).toHaveAttribute('data-cy', 'post-tag-remove-btn');
  });

  it('renders with custom color', () => {
    render(<PostTag label="bitcoin" color="#123456" />);
    const tag = screen.getByRole('button');

    expect(tag).toHaveStyle({ backgroundImage: expect.stringContaining('#123456') });
    expect(tag).toHaveAttribute('data-tag-label', 'bitcoin');
    expect(tag).toHaveAttribute('data-cy', 'post-tag');
  });

  it('is unpressed without a selection border by default', () => {
    const { container } = render(<PostTag label="bitcoin" color="#123456" />);

    const tag = screen.getByRole('button');
    expect(tag).toHaveAttribute('aria-pressed', 'false');
    expect(tag).toHaveAttribute('data-state', 'off');
    expect(tag.style.boxShadow).toBe('');
    expect(container.querySelector('.border-solid.absolute')).toBeNull();
  });

  it('reflects the selected state with a pressed toggle and a border overlay', () => {
    const { container } = render(<PostTag label="bitcoin" color="#123456" selected />);

    const tag = screen.getByRole('button');
    expect(tag).toHaveAttribute('aria-pressed', 'true');
    expect(tag).toHaveAttribute('data-state', 'on');
    expect(tag.style.boxShadow).toContain('#123456');
    const overlay = container.querySelector('.border-solid.absolute');
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });

  it('only renders the close control when showClose is set', () => {
    const { rerender } = render(<PostTag label="bitcoin" />);
    expect(screen.queryByLabelText(/remove bitcoin tag/i)).not.toBeInTheDocument();

    rerender(<PostTag label="bitcoin" showClose />);
    expect(screen.getByLabelText(/remove bitcoin tag/i)).toBeInTheDocument();
  });

  it('merges a custom className', () => {
    render(<PostTag label="bitcoin" className="custom-tag" />);
    expect(screen.getByRole('button')).toHaveClass('custom-tag', 'rounded-md', 'h-8');
  });
});
