'use client';

import { forwardRef } from 'react';
import { cn } from '@/libs/utils/utils';
import type { AudioProps } from './Audio.types';

/**
 * The browser's own audio player, drawn in the app's theme: `color-scheme` is dark like the app's `:root`
 * tokens, light under the `light` class next-themes sets on <html>. The document itself sets no `color-scheme`
 * (see ThemeProvider), so without this the controls stay light on the dark theme.
 */
export const Audio = forwardRef<HTMLAudioElement, AudioProps>(function Audio(
  { 'data-testid': dataTestId, className, src, controls = true, preload = 'metadata', ...props }: AudioProps,
  ref,
) {
  return (
    <audio
      ref={ref}
      data-testid={dataTestId || 'audio'}
      className={cn('w-full scheme-dark light:scheme-light', className)}
      src={src}
      controls={controls}
      preload={preload}
      {...props}
    />
  );
});
