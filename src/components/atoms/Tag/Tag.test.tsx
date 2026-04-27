import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Tag } from './Tag';
import { generateRandomColor, hexToRgba } from '@/libs/utils/utils';

describe('Tag', () => {
  it('renders tag with count', () => {
    render(<Tag name="bitcoin" count={16} />);

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByTestId('tag-count')).toBeInTheDocument();
  });

  it('does not render count when not provided', () => {
    render(<Tag name="bitcoin" />);

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
    expect(screen.queryByTestId('tag-count')).not.toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const mockOnClick = vi.fn();
    render(<Tag name="bitcoin" onClick={mockOnClick} />);

    const tag = screen.getByTestId('tag');
    fireEvent.click(tag);

    expect(mockOnClick).toHaveBeenCalledWith('bitcoin');
  });

  it('generates consistent colors for same tag name', () => {
    const { container: container1 } = render(<Tag name="bitcoin" />);
    const { container: container2 } = render(<Tag name="bitcoin" />);

    const style1 = container1.firstChild as HTMLElement;
    const style2 = container2.firstChild as HTMLElement;

    expect(style1.style.backgroundColor).toBe(style2.style.backgroundColor);
  });

  it('generates different colors for different tag names', () => {
    const { container: container1 } = render(<Tag name="bitcoin" />);
    const { container: container2 } = render(<Tag name="ethereum" />);

    const style1 = container1.firstChild as HTMLElement;
    const style2 = container2.firstChild as HTMLElement;

    expect(style1.style.backgroundColor).not.toBe(style2.style.backgroundColor);
  });

  it('uses custom color for known tags with opacity', () => {
    const { container } = render(<Tag name="bitcoin" />);
    const style = container.firstChild as HTMLElement;

    const expectedColor = hexToRgba(generateRandomColor('bitcoin'), 0.3);
    expect(style.style.backgroundColor).toBe(expectedColor);
  });

  it('maintains background color regardless of clicked state', () => {
    const { container: container1 } = render(<Tag name="bitcoin" clicked={false} />);
    const { container: container2 } = render(<Tag name="bitcoin" clicked={true} />);

    const tag1 = container1.firstChild as HTMLElement;
    const tag2 = container2.firstChild as HTMLElement;

    // Both should have same background color
    const expectedColor = hexToRgba(generateRandomColor('bitcoin'), 0.3);
    expect(tag1.style.backgroundColor).toBe(expectedColor);
    expect(tag2.style.backgroundColor).toBe(expectedColor);
  });

  it('shows shadow on hover when not clicked', () => {
    const { container } = render(<Tag name="bitcoin" clicked={false} />);
    const tag = container.firstChild as HTMLElement;

    // Initial state - no shadow
    expect(tag.style.boxShadow).toBe('');

    // Hover the tag
    fireEvent.mouseEnter(tag);

    // Should show inset shadow (using borderColor which is 0.5 opacity)
    const expectedShadowColor = hexToRgba(generateRandomColor('bitcoin'), 0.5);
    expect(tag.style.boxShadow).toBe(`inset 0 0 10px 2px ${expectedShadowColor}`);

    // Leave hover
    fireEvent.mouseLeave(tag);

    // Should remove shadow
    expect(tag.style.boxShadow).toBe('');
  });

  it('does not show shadow on hover when clicked', () => {
    const { container } = render(<Tag name="bitcoin" clicked={true} />);
    const tag = container.firstChild as HTMLElement;

    // Initial state - no shadow
    expect(tag.style.boxShadow).toBe('');

    // Hover the tag
    fireEvent.mouseEnter(tag);

    // Should not show shadow when clicked
    expect(tag.style.boxShadow).toBe('');

    // Leave hover
    fireEvent.mouseLeave(tag);

    // Should still not have shadow
    expect(tag.style.boxShadow).toBe('');
  });

  it('maintains border when clicked and hovered', () => {
    const { container } = render(<Tag name="bitcoin" clicked={true} />);
    const tag = container.firstChild as HTMLElement;

    // Should have border when clicked (using 0.5 opacity)
    const expectedBorderColor = hexToRgba(generateRandomColor('bitcoin'), 0.5);
    expect(tag.style.border).toBe(`1px solid ${expectedBorderColor}`);

    // Hover and leave
    fireEvent.mouseEnter(tag);
    fireEvent.mouseLeave(tag);

    // Should still have border
    expect(tag.style.border).toBe(`1px solid ${expectedBorderColor}`);
  });
});

describe('Tag - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Tag name="default props" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with count', () => {
    const { container } = render(<Tag name="sixteen count" count={16} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with zero count', () => {
    const { container } = render(<Tag name="zero count" count={0} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with large count', () => {
    const { container } = render(<Tag name="large count" count={999999} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when clicked', () => {
    const { container } = render(<Tag name="been clicked" clicked={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot without clicked', () => {
    const { container } = render(<Tag name="clicked false" clicked={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Tag name="custom-class" className="custom-tag" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with all props combined', () => {
    const { container } = render(
      <Tag name="defi" count={123} clicked={true} className="combined-tag" data-testid="combined-test" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for long tag name', () => {
    const { container } = render(<Tag name="very-long-tag-name-example" count={7} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
