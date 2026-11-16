'use client';

import * as React from 'react';
import { useTagDayPalette } from '@/hooks/useTagDayPalette/useTagDayPalette';
import { getTagPaletteStyle } from '@/libs/utils/tagPalette';
import { cn, generateRandomColor, hexToRgba } from '@/libs/utils/utils';
import { Typography } from '../Typography/Typography';
import type { TagProps } from './Tag.types';

export const Tag = ({
  name,
  count,
  clicked = false,
  onClick,
  className,
  'data-testid': dataTestId,
  'data-cy': dataCy,
  countDataCy,
  ...props
}: TagProps) => {
  const [isHovered, setIsHovered] = React.useState(false);

  const base = generateRandomColor(name);
  const day = useTagDayPalette(base);
  const paletteStyle = getTagPaletteStyle({
    nightFill: hexToRgba(base, 0.3),
    nightEdge: hexToRgba(base, 0.5),
    dayFill: day.background,
    day,
  });

  const handleClick = () => {
    onClick?.(name);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <div
      className={cn(
        'tag-palette flex h-8 w-fit max-w-full min-w-0 cursor-pointer items-center justify-between rounded-md px-3 transition-all duration-200',
        className,
      )}
      style={{
        ...paletteStyle,
        backgroundColor: 'var(--tag-fill)',
        border: clicked ? '1px solid var(--tag-edge)' : '1px solid transparent',
        boxShadow: !clicked && isHovered ? 'inset 0 0 10px 2px var(--tag-edge)' : undefined,
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={name}
      data-testid={dataTestId || 'tag'}
      data-cy={dataCy || 'tag'}
      {...props}
    >
      <Typography
        size="sm"
        className="truncate font-bold text-(--tag-label)"
        data-testid="tag-name"
        data-cy={`${dataCy || 'tag'}-name`}
      >
        {name}
      </Typography>

      {count !== undefined && (
        <Typography
          size="sm"
          className="ml-1.5 shrink-0 font-medium text-(--tag-count)"
          data-testid="tag-count"
          data-cy={countDataCy || `${dataCy || 'tag'}-count`}
        >
          {count}
        </Typography>
      )}
    </div>
  );
};
