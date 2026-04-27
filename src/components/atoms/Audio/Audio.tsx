'use client';

import { forwardRef } from 'react';
import * as Types from './Audio.types';
import { cn } from '@/libs/utils/utils';

export const Audio = forwardRef<HTMLAudioElement, Types.AudioProps>(function Audio(
  { 'data-testid': dataTestId, className, src, controls = true, preload = 'metadata', ...props }: Types.AudioProps,
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
