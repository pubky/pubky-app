import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, AvatarFallback, AvatarImage } from './Avatar';

describe('Avatar', () => {
  it('defaults to the default size and merges className on the root', () => {
    const { container } = render(<Avatar className="custom-avatar" />);

    const root = container.firstChild;
    expect(root).toHaveClass('h-10', 'w-10', 'rounded-full');
    expect(root).toHaveClass('custom-avatar');
  });

  it.each([
    ['sm', 'h-6'],
    ['md', 'h-8'],
    ['default', 'h-10'],
    ['lg', 'h-12'],
    ['xl', 'h-16'],
  ] as const)('applies size=%s', (size, className) => {
    const { container } = render(<Avatar size={size} />);
    expect(container.firstChild).toHaveClass(className);
  });

  it('shows the fallback while the image has not loaded', () => {
    render(
      <Avatar>
        <AvatarImage src="/test.jpg" alt="Test avatar" />
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );

    // jsdom never fires image load events, so Radix keeps the image unmounted
    // and renders the fallback instead.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('AB')).toBeInTheDocument();
  });

  it('merges className on AvatarFallback', () => {
    render(
      <Avatar>
        <AvatarFallback className="custom-fallback">AB</AvatarFallback>
      </Avatar>,
    );

    const fallback = screen.getByText('AB');
    expect(fallback).toHaveClass('bg-muted');
    expect(fallback).toHaveClass('custom-fallback');
  });
});
