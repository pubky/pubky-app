import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostTagAddButton } from './PostTagAddButton';

describe('PostTagAddButton', () => {
  it('renders button element', () => {
    render(<PostTagAddButton />);

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('calls onClick when button is clicked', () => {
    const mockOnClick = vi.fn();
    render(<PostTagAddButton onClick={mockOnClick} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('suppresses navigation (preventDefault + stopPropagation) on click, while still calling onClick', () => {
    const mockOnClick = vi.fn();
    render(<PostTagAddButton onClick={mockOnClick} />);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(clickEvent, 'preventDefault');
    const stopPropagation = vi.spyOn(clickEvent, 'stopPropagation');
    screen.getByRole('button').dispatchEvent(clickEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('has correct aria-label', () => {
    render(<PostTagAddButton />);

    const button = screen.getByLabelText('Add new tag');
    expect(button).toBeInTheDocument();
  });

  it('is disabled when disabled prop is true', () => {
    render(<PostTagAddButton disabled />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('uses dashed style by default', () => {
    render(<PostTagAddButton />);

    expect(screen.getByRole('button')).toHaveClass('border-dashed');
  });

  it('uses plain style when variant is plain', () => {
    render(<PostTagAddButton variant="plain" />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('border-transparent');
    expect(button).toHaveClass('shadow-none');
    expect(button).not.toHaveClass('border-dashed');
  });

  it('does not call onClick when disabled', () => {
    const mockOnClick = vi.fn();
    render(<PostTagAddButton onClick={mockOnClick} disabled />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockOnClick).not.toHaveBeenCalled();
  });
});

describe('PostTagAddButton - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<PostTagAddButton />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when disabled', () => {
    const { container } = render(<PostTagAddButton disabled />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with plain variant', () => {
    const { container } = render(<PostTagAddButton variant="plain" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
