import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CanvasAnchoredPopover } from './CanvasAnchoredPopover';

describe('CanvasAnchoredPopover', () => {
  it('renders its content absolutely positioned with the given data-cy', () => {
    render(
      <div style={{ position: 'relative' }}>
        <CanvasAnchoredPopover x={100} y={50} data-cy="anchored">
          <span>content</span>
        </CanvasAnchoredPopover>
      </div>,
    );
    expect(screen.getByText('content')).toBeInTheDocument();
    const el = document.querySelector('[data-cy="anchored"]') as HTMLElement;
    expect(el.className).toContain('absolute');
  });
});
