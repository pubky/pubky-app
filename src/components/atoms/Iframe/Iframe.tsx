import { forwardRef } from 'react';
import type { IframeProps } from './Iframe.types';
import { cn } from '@/libs/utils/utils';

export const Iframe = forwardRef<HTMLIFrameElement, IframeProps>(function Iframe(
  { 'data-testid': dataTestId, className, width = '100%', height = '315', ...props }: IframeProps,
  ref,
) {
  return (
    <iframe
      ref={ref}
      data-testid={dataTestId || 'iframe'}
      className={cn('rounded-md', className)}
      loading="lazy"
      allowFullScreen
      width={width}
      height={height}
      {...props}
    />
  );
});
