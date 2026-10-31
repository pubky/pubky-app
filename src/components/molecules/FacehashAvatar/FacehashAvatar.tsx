'use client';

import { Facehash, stringHash } from 'facehash';
import { Typography } from '@/atoms/Typography/Typography';
import { useTagDayPalette } from '@/hooks/useTagDayPalette/useTagDayPalette';
import { getTagPaletteStyle } from '@/libs/utils/tagPalette';
import { cn } from '@/libs/utils/utils';
import { FACEHASH_AVATAR_COLORS } from './FacehashAvatar.constants';
import type { FacehashAvatarProps } from './FacehashAvatar.types';

/** Facehash paints its one colour with this; `.tag-palette` resolves it for the active theme */
const THEMED_FILL = ['var(--tag-fill)'];

function isVisualRegressionTest(): boolean {
  return typeof globalThis !== 'undefined' && (globalThis as { __VRT__?: boolean }).__VRT__ === true;
}

/**
 * Renders a deterministic generative face avatar using the `facehash` library.
 * Wraps the Facehash component with the shared color palette and standard
 * mouth rendering that displays the user's initial.
 *
 * The colour is picked per seed the same way Facehash does (`stringHash(seed) % colors.length`).
 * Night mode paints it as is with dark features; Day mode uses the tag Day palette (in the
 * chosen light mapping) for that colour, so the face matches the tag chips and its features take the chip's label colour.
 */
export function FacehashAvatar({ seed, initial, className }: FacehashAvatarProps) {
  const freezeForVrt = isVisualRegressionTest();
  const color = FACEHASH_AVATAR_COLORS[stringHash(seed) % FACEHASH_AVATAR_COLORS.length];
  const day = useTagDayPalette(color);

  return (
    <Facehash
      name={seed}
      size="100%"
      showInitial={false}
      colors={THEMED_FILL}
      enableBlink={!freezeForVrt}
      intensity3d={freezeForVrt ? 'none' : 'dramatic'}
      interactive={!freezeForVrt}
      style={getTagPaletteStyle({ nightFill: color, nightEdge: color, dayFill: day.background, day })}
      className={cn(
        'tag-palette h-full w-full rounded-full text-background [.light_&]:text-(--tag-day-label)',
        className,
      )}
      onRenderMouth={() => (
        <Typography
          as="span"
          overrideDefaults
          data-testid="avatar-fallback-initial"
          style={{ fontSize: '26cqw', lineHeight: 1 }}
        >
          {initial}
        </Typography>
      )}
    />
  );
}
