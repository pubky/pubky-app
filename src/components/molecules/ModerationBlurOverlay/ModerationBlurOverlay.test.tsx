import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModerationBlurOverlay } from './ModerationBlurOverlay';

describe('ModerationBlurOverlay', () => {
  it('renders the provided label', () => {
    render(<ModerationBlurOverlay label="Collection content moderated." />);

    expect(screen.getByText('Collection content moderated.')).toBeInTheDocument();
  });

  it('renders the eye-off icon', () => {
    const { container } = render(<ModerationBlurOverlay label="Post content moderated." />);

    expect(container.querySelector('.lucide-eye-off')).toBeInTheDocument();
  });

  it('fills its positioned parent so it overlays the blurred content', () => {
    const { container } = render(<ModerationBlurOverlay label="Moderated." />);

    // The overlay is the root element; `absolute inset-0` is what makes it sit
    // on top of the blurred placeholder behind it.
    const overlay = container.firstChild as HTMLElement;
    expect(overlay).toHaveClass('absolute', 'inset-0');
  });

  it('merges a custom className onto the base classes', () => {
    const { container } = render(<ModerationBlurOverlay label="Moderated." className="z-10" />);

    const overlay = container.firstChild as HTMLElement;
    expect(overlay).toHaveClass('z-10');
    expect(overlay).toHaveClass('absolute', 'inset-0');
  });
});

describe('ModerationBlurOverlay - Snapshots', () => {
  it('matches the snapshot', () => {
    const { container } = render(<ModerationBlurOverlay label="Collection content moderated." />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
