import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VibesLink } from './VibesLink';

const auth = vi.hoisted(() => ({ currentUserPubky: 'alice' as string | null }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: typeof auth) => unknown) => selector(auth),
}));

const storageKey = 'pubky-feature-discovery:alice:vibes-alert-v1';
beforeEach(() => {
  localStorage.clear();
  auth.currentUserPubky = 'alice';
});

describe('VibesLink', () => {
  it('preserves external-link defaults, caller styling and refs', () => {
    const ref = createRef<HTMLAnchorElement>();
    render(
      <VibesLink ref={ref} className="text-inherit">
        Try Vibes
      </VibesLink>,
    );
    const link = screen.getByRole('link', { name: 'Try Vibes' });
    expect(link).toHaveAttribute('href', 'https://vibes.pubky.app');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('class', 'text-inherit');
    expect(ref.current).toBe(link);
  });

  it.each(['left click', 'middle click', 'Enter'])('records Try on %s', async (activation) => {
    const user = userEvent.setup();
    render(<VibesLink>Try Vibes</VibesLink>);
    const link = screen.getByRole('link', { name: 'Try Vibes' });
    if (activation === 'Enter') {
      await user.tab();
      await user.keyboard('{Enter}');
    } else {
      await user.pointer({ target: link, keys: activation === 'middle click' ? '[MouseMiddle]' : '[MouseLeft]' });
    }
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({ tried: true });
  });

  it('does not dismiss when merely opening the context menu', async () => {
    const user = userEvent.setup();
    render(<VibesLink>Try Vibes</VibesLink>);
    await user.pointer({ target: screen.getByRole('link'), keys: '[MouseRight]' });
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('respects a cancelled navigation', async () => {
    const user = userEvent.setup();
    render(<VibesLink onClick={(event) => event.preventDefault()}>Try Vibes</VibesLink>);
    await user.click(screen.getByRole('link'));
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('lets guests follow the link without persisting an account choice', async () => {
    const user = userEvent.setup();
    auth.currentUserPubky = null;
    render(<VibesLink>Try Vibes</VibesLink>);
    await user.click(screen.getByRole('link'));
    expect(localStorage.length).toBe(0);
  });

  it('matches the link snapshot', () => {
    const { container } = render(<VibesLink>Try Vibes</VibesLink>);
    expect(container.firstChild).toMatchSnapshot();
  });
});
