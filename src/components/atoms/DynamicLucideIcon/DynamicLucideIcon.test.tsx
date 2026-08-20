import { render, screen, waitFor } from '@testing-library/react';
import { Library } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { loadLucideIconNode } from '@/libs/utils/lucideIcons';
import { DynamicLucideIcon } from './DynamicLucideIcon';

// The icon cache is module-level and persists across tests in this file, so
// every loading-state assertion uses an icon name no other test has loaded.
describe('DynamicLucideIcon', () => {
  it('renders a valid dynamic icon once its chunk resolves', async () => {
    render(<DynamicLucideIcon name="mountain" data-testid="dynamic-icon" />);

    await waitFor(() => expect(screen.getByTestId('dynamic-icon').querySelector('path')).not.toBeNull());
  });

  it('never shows the fallback while a valid icon is loading', async () => {
    render(<DynamicLucideIcon name="anchor" data-testid="loading-icon" className="size-5" />);

    const svg = screen.getByTestId('loading-icon');
    expect(svg).toHaveClass('lucide');
    expect(svg).toHaveClass('size-5');
    expect(svg).not.toHaveClass('lucide-activity');
    expect(svg.childElementCount).toBe(0);

    await waitFor(() => expect(svg.querySelector('path')).not.toBeNull());
  });

  it('renders a cached icon synchronously on first paint', async () => {
    await loadLucideIconNode('library');

    render(<DynamicLucideIcon name="library" data-testid="cached-icon" />);

    expect(screen.getByTestId('cached-icon').querySelector('path')).not.toBeNull();
  });

  it('renders the default fallback for a missing icon', () => {
    render(<DynamicLucideIcon data-testid="fallback-icon" />);

    expect(screen.getByTestId('fallback-icon')).toHaveClass('lucide-activity');
  });

  it('renders a consumer-provided fallback for an invalid icon', () => {
    render(
      <DynamicLucideIcon
        name="not-a-real-lucide-icon"
        fallback={Library}
        data-testid="fallback-icon"
        className="size-6"
      />,
    );

    expect(screen.getByTestId('fallback-icon')).toHaveClass('lucide-library');
    expect(screen.getByTestId('fallback-icon')).toHaveClass('size-6');
  });

  it('can omit the fallback while a consumer handles its own loading state', () => {
    const { container } = render(<DynamicLucideIcon name="not-a-real-lucide-icon" fallback={null} />);

    expect(container.firstChild).toBeNull();
  });
});

describe('DynamicLucideIcon - Snapshots', () => {
  it('matches snapshot for a consumer-provided fallback', () => {
    const { container } = render(<DynamicLucideIcon name={null} fallback={Library} className="size-6" />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
