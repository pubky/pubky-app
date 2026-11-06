'use client';

import { X } from 'lucide-react';
import { Tag } from '@/atoms/Tag/Tag';
import { Toggle } from '@/atoms/Toggle/Toggle';
import { useTagDayPalette } from '@/hooks/useTagDayPalette/useTagDayPalette';
import { getTagPaletteStyle } from '@/libs/utils/tagPalette';
import { cn, generateRandomColor } from '@/libs/utils/utils';
import type { PostTagProps } from './PostTag.types';

/**
 * Night mode wash laid over the tag colour: `--tag-overlay` is 70% background
 * (Figma `alpha/30`), darkening the chip so `text-foreground` stays legible.
 * Day mode uses a solid chip from `useTagDayPalette` instead.
 */
const TAG_OVERLAY = 'var(--tag-overlay)';

export function PostTag({
  label,
  count,
  showClose = false,
  selected = false,
  onClick,
  onClose,
  color,
  className,
  ...rest
}: PostTagProps) {
  const tagColor = color || generateRandomColor(label);
  const backgroundGradient = `linear-gradient(90deg, ${TAG_OVERLAY} 0%, ${TAG_OVERLAY} 100%), linear-gradient(90deg, ${tagColor} 0%, ${tagColor} 100%)`;
  const day = useTagDayPalette(tagColor);
  const paletteStyle = getTagPaletteStyle({
    nightFill: backgroundGradient,
    nightEdge: tagColor,
    dayFill: `linear-gradient(90deg, ${day.background} 0%, ${day.background} 100%)`,
    day,
  });
  // A tag chip's only jobs are toggle / close — never navigation. Suppressing
  // both the native default and propagation lets it sit inside a clickable or
  // linked surface (e.g. a collection card wrapped in a `Link`) without the
  // click bubbling into navigation; harmless everywhere else.
  const handleClose = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClose?.(e);
  };
  return (
    <Toggle
      {...rest}
      pressed={selected}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.(e);
      }}
      data-cy="post-tag"
      data-tag-label={label}
      className={cn(
        'tag-palette group/tag relative h-8 max-w-full gap-1 rounded-md px-3 backdrop-blur-lg',
        'border-0 text-sm leading-5 font-bold text-(--tag-label) subpixel-antialiased',
        'transition-all duration-200',
        // Override Toggle default hover styles - keep text colour
        'hover:bg-transparent hover:text-(--tag-label)',
        // Selected state - add border
        'data-[state=on]:border data-[state=on]:border-solid data-[state=on]:bg-transparent data-[state=on]:text-(--tag-label)',
        className,
      )}
      style={{
        ...paletteStyle,
        backgroundImage: 'var(--tag-fill)',
        boxShadow: selected ? 'inset 0 0 0 1px var(--tag-edge)' : undefined,
      }}
      aria-label={count !== undefined ? `${label} tag (${count} posts)` : `${label} tag`}
    >
      <Tag
        name={label}
        count={count}
        countDataCy="post-tag-count"
        className="px-0"
        style={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none' }}
      />

      {/* Close button */}
      {showClose && (
        <span
          onClick={handleClose}
          className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded opacity-70 transition-opacity hover:opacity-100"
          aria-label={`Remove ${label} tag`}
          data-cy="post-tag-remove-btn"
          role="button"
        >
          <X className="size-3" strokeWidth={2} />
        </span>
      )}

      {/* Hover shadow overlay - exactly as Figma */}
      <span
        className="pointer-events-none absolute inset-0 rounded-md opacity-0 transition-opacity group-hover/tag:opacity-100"
        style={{
          boxShadow: 'inset 0px 0px 8px 0px var(--tag-edge)',
        }}
        aria-hidden="true"
      />

      {/* Selected border overlay */}
      {selected && (
        <span
          className="pointer-events-none absolute inset-0 rounded-md border border-solid"
          style={{
            borderColor: 'var(--tag-edge)',
          }}
          aria-hidden="true"
        />
      )}
    </Toggle>
  );
}
