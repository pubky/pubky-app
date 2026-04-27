import * as React from 'react';
import NextImage from 'next/image';
import * as Types from './Image.types';
import { cn } from '@/libs/utils/utils';

export const Image = React.forwardRef<HTMLImageElement, Types.ImageProps>(
  ({ className, src, alt, fill, unoptimized = true, width, height, ...props }, ref) => {
    // For external URLs or when fill is not used, we need width/height
    // If width/height are not provided, use unoptimized mode
    const isExternal = src.startsWith('http://') || src.startsWith('https://');

    // Provide default dimensions if not specified and not using fill mode
    const defaultWidth = width || (!fill ? 800 : undefined);
    const defaultHeight = height || (!fill ? 600 : undefined);

    return (
      <NextImage
        ref={ref}
        src={src}
        alt={alt}
        className={cn('h-auto max-w-full', className)}
        unoptimized={unoptimized || isExternal}
        fill={fill}
        width={defaultWidth}
        height={defaultHeight}
        {...props}
      />
    );
  },
);

Image.displayName = 'Image';
