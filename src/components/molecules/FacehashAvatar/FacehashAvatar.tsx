'use client';

import { Facehash } from 'facehash';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { FACEHASH_AVATAR_COLORS } from './FacehashAvatar.constants';
import type { FacehashAvatarProps } from './FacehashAvatar.types';

function isVisualRegressionTest(): boolean {
  return typeof globalThis !== 'undefined' && (globalThis as { __VRT__?: boolean }).__VRT__ === true;
}

/**
 * Renders a deterministic generative face avatar using the `facehash` library.
 * Wraps the Facehash component with the shared color palette and standard
 * mouth rendering that displays the user's initial.
 */
export function FacehashAvatar({ seed, initial, className }: FacehashAvatarProps) {
  const freezeForVrt = isVisualRegressionTest();

  return (
    <Facehash
      name={seed}
      size="100%"
      showInitial={false}
      colors={FACEHASH_AVATAR_COLORS}
      enableBlink={!freezeForVrt}
      intensity3d={freezeForVrt ? 'none' : 'dramatic'}
      interactive={!freezeForVrt}
      className={cn('h-full w-full rounded-full text-background', className)}
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
