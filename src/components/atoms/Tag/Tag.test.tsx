import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTagDayPalette } from '@/libs/utils/tagPalette';
import { generateRandomColor, hexToRgba } from '@/libs/utils/utils';
import { useAppearanceStore } from '@/stores/appearance/appearance.store';
import { appearanceInitialState } from '@/stores/appearance/appearance.types';
import { Tag } from './Tag';

describe('Tag', () => {
  beforeEach(() => {
    useAppearanceStore.setState(appearanceInitialState);
  });

  it('renders tag with count', () => {
    render(<Tag name="bitcoin" count={16} />);

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByTestId('tag-count')).toBeInTheDocument();
  });

  it('allows overriding count data-cy selector', () => {
    render(<Tag name="bitcoin" count={16} countDataCy="post-tag-count" />);
    expect(screen.getByText('16')).toHaveAttribute('data-cy', 'post-tag-count');
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

    expect(style1.style.getPropertyValue('--tag-night-fill')).toBe(style2.style.getPropertyValue('--tag-night-fill'));
  });

  it('generates different colors for different tag names', () => {
    const { container: container1 } = render(<Tag name="bitcoin" />);
    const { container: container2 } = render(<Tag name="ethereum" />);

    const style1 = container1.firstChild as HTMLElement;
    const style2 = container2.firstChild as HTMLElement;

    expect(style1.style.getPropertyValue('--tag-night-fill')).not.toBe(
      style2.style.getPropertyValue('--tag-night-fill'),
    );
  });

  it('uses custom color for known tags with opacity', () => {
    const { container } = render(<Tag name="bitcoin" />);
    const style = container.firstChild as HTMLElement;

    const expectedColor = hexToRgba(generateRandomColor('bitcoin'), 0.3);
    expect(style).toHaveClass('tag-palette');
    expect(style.style.backgroundColor).toBe('var(--tag-fill)');
    expect(style.style.getPropertyValue('--tag-night-fill')).toBe(expectedColor);
  });

  it('sets the pastel day mode palette for the tag colour by default', () => {
    const { container } = render(<Tag name="bitcoin" />);
    const style = container.firstChild as HTMLElement;

    const day = getTagDayPalette(generateRandomColor('bitcoin'), 'pastel');
    expect(style.style.getPropertyValue('--tag-day-fill')).toBe(day.background);
    expect(style.style.getPropertyValue('--tag-day-edge')).toBe(day.accent);
    expect(style.style.getPropertyValue('--tag-day-label')).toBe(day.label);
    expect(style.style.getPropertyValue('--tag-day-count')).toBe(day.count);
  });

  it('switches to the saturated day mode palette live when chosen', () => {
    const { container } = render(<Tag name="synonym" />);
    const style = container.firstChild as HTMLElement;
    const color = generateRandomColor('synonym');

    act(() => {
      useAppearanceStore.getState().setTagLightPalette('saturated');
    });

    const day = getTagDayPalette(color, 'saturated');
    expect(style.style.getPropertyValue('--tag-day-fill')).toBe(day.background);
    expect(style.style.getPropertyValue('--tag-day-label')).toBe(day.label);
    expect(style.style.getPropertyValue('--tag-night-fill')).toBe(hexToRgba(color, 0.3));
  });

  it('maintains background color regardless of clicked state', () => {
    const { container: container1 } = render(<Tag name="bitcoin" clicked={false} />);
    const { container: container2 } = render(<Tag name="bitcoin" clicked={true} />);

    const tag1 = container1.firstChild as HTMLElement;
    const tag2 = container2.firstChild as HTMLElement;

    // Both should have same background color
    const expectedColor = hexToRgba(generateRandomColor('bitcoin'), 0.3);
    expect(tag1.style.getPropertyValue('--tag-night-fill')).toBe(expectedColor);
    expect(tag2.style.getPropertyValue('--tag-night-fill')).toBe(expectedColor);
  });

  it('shows shadow on hover when not clicked', () => {
    const { container } = render(<Tag name="bitcoin" clicked={false} />);
    const tag = container.firstChild as HTMLElement;

    // Initial state - no shadow
    expect(tag.style.boxShadow).toBe('');

    // Hover the tag
    fireEvent.mouseEnter(tag);

    // Should show inset shadow in the edge colour (Night mode: the tag colour at 0.5 opacity)
    const expectedShadowColor = hexToRgba(generateRandomColor('bitcoin'), 0.5);
    expect(tag.style.boxShadow).toBe('inset 0 0 10px 2px var(--tag-edge)');
    expect(tag.style.getPropertyValue('--tag-night-edge')).toBe(expectedShadowColor);

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

    // Should have border when clicked, in the edge colour
    expect(tag.style.border).toBe('1px solid var(--tag-edge)');

    // Hover and leave
    fireEvent.mouseEnter(tag);
    fireEvent.mouseLeave(tag);

    // Should still have border
    expect(tag.style.border).toBe('1px solid var(--tag-edge)');
  });
});
