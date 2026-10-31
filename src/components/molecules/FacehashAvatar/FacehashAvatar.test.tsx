import { render } from '@testing-library/react';
import { stringHash } from 'facehash';
import { describe, expect, it } from 'vitest';
import { getTagDayPalette } from '@/libs/utils/tagPalette';
import { FacehashAvatar } from './FacehashAvatar';
import { FACEHASH_AVATAR_COLORS } from './FacehashAvatar.constants';

function renderAvatar(seed: string) {
  const { container } = render(<FacehashAvatar seed={seed} initial="A" />);
  const avatar = container.querySelector<HTMLElement>('[data-facehash]');
  if (!avatar) throw new Error('Facehash wrapper not rendered');
  return avatar;
}

describe('FacehashAvatar', () => {
  it('paints the seed colour through the theme-aware tag palette', () => {
    const seed = 'alice-pubky';
    const color = FACEHASH_AVATAR_COLORS[stringHash(seed) % FACEHASH_AVATAR_COLORS.length];
    const day = getTagDayPalette(color);
    const avatar = renderAvatar(seed);

    expect(avatar).toHaveClass('tag-palette', 'text-background', '[.light_&]:text-(--tag-day-label)');
    expect(avatar.style.backgroundColor).toBe('var(--tag-fill)');
    expect(avatar.style.getPropertyValue('--tag-night-fill')).toBe(color);
    expect(avatar.style.getPropertyValue('--tag-day-fill')).toBe(day.background);
    expect(avatar.style.getPropertyValue('--tag-day-label')).toBe(day.label);
  });

  it('gives the same seed the same colour', () => {
    expect(renderAvatar('bob').style.getPropertyValue('--tag-night-fill')).toBe(
      renderAvatar('bob').style.getPropertyValue('--tag-night-fill'),
    );
  });

  it('renders the initial in the mouth', () => {
    const avatar = renderAvatar('carol');
    expect(avatar.querySelector('[data-testid="avatar-fallback-initial"]')).toHaveTextContent('A');
  });
});
