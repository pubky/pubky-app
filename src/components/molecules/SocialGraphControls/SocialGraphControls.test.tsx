import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SocialGraphControls } from './SocialGraphControls';

const props = {
  declutter: true,
  onToggleDeclutter: vi.fn(),
  physicsPaused: false,
  onTogglePhysics: vi.fn(),
  onReleasePins: vi.fn(),
  communitiesOn: false,
  onToggleCommunities: vi.fn(),
  timeMachineOn: false,
  timeMachineAvailable: true,
  onToggleTimeMachine: vi.fn(),
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onFit: vi.fn(),
  onRecenter: vi.fn(),
};

describe('SocialGraphControls', () => {
  it('wires camera buttons and mode toggles', () => {
    render(<SocialGraphControls {...props} />);

    fireEvent.click(document.querySelector('[data-cy="graph-zoom-in"]')!);
    expect(props.onZoomIn).toHaveBeenCalled();

    fireEvent.click(document.querySelector('[data-cy="graph-declutter"]')!);
    expect(props.onToggleDeclutter).toHaveBeenCalled();

    fireEvent.click(document.querySelector('[data-cy="graph-time-toggle"]')!);
    expect(props.onToggleTimeMachine).toHaveBeenCalled();
  });

  it('reflects mode state via aria-pressed and disables the time machine without timestamps', () => {
    const { rerender } = render(<SocialGraphControls {...props} />);
    expect(document.querySelector('[data-cy="graph-declutter"]')).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-cy="graph-communities"]')).toHaveAttribute('aria-pressed', 'false');

    rerender(<SocialGraphControls {...props} timeMachineAvailable={false} />);
    expect(document.querySelector('[data-cy="graph-time-toggle"]')).toBeDisabled();
  });
});
