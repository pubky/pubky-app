'use client';

import { forwardRef } from 'react';
import { cn } from '@/libs/utils/utils';
import type { AudioProps } from './Audio.types';

export const Audio = forwardRef<HTMLAudioElement, AudioProps>(function Audio(
  { 'data-testid': dataTestId, className, src, controls = true, preload = 'metadata', ...props }: AudioProps,
  ref,
) {
  return (
    <audio
      ref={ref}
      data-testid={dataTestId || 'audio'}
      className={cn('w-full', className)}
      src={src}
      controls={controls}
      preload={preload}
      {...props}
    />
  );
});
