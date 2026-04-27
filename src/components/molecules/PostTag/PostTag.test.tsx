import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PostTag } from './PostTag';

// Mock @/libs with partial mock
vi.mock('@/libs', async () => {
  const actual = await vi.importActual<typeof import('@/libs')>('@/libs');
  return {
    ...actual,
    generateRandomColor: vi.fn((str: string) => {
      // Return consistent colors for testing
      const colorMap: Record<string, string> = {
        bitcoin: '#FF9900',
        synonym: '#FF0000',
        test: '#00FF00',
      };
      return colorMap[str.toLowerCase()] || '#FF9900';
    }),
    hexToRgba: vi.fn((hex: string, alpha: number) => {
      const [r, g, b] = hex.match(/\w\w/g)!.map((x) => parseInt(x, 16));
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }),
  };
});

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

  it('renders with custom color', () => {
    const { container } = render(<PostTag label="bitcoin" color="#123456" />);
    const tag = screen.getByRole('button');

    // Verify the tag is rendered (custom color is applied via inline styles in the snapshot)
    expect(tag).toBeInTheDocument();
    expect(container.firstChild).toBeTruthy();
  });
});

describe('PostTag - Snapshots', () => {
  it('matches snapshot with default state', () => {
    const { container } = render(<PostTag label="bitcoin" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when selected', () => {
    const { container } = render(<PostTag label="bitcoin" selected />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with counter', () => {
    const { container } = render(<PostTag label="bitcoin" count={16} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with close button', () => {
    const { container } = render(<PostTag label="bitcoin" showClose />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with all features', () => {
    const { container } = render(<PostTag label="bitcoin" count={16} showClose selected />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom color', () => {
    const { container } = render(<PostTag label="bitcoin" color="#FF0000" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
