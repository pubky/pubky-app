import * as Atoms from '@/atoms';
import { COLORS } from '@/config';
import * as Libs from '@/libs';
import type { PostTagProps } from './PostTag.types';

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
  const tagColor = color || Libs.generateRandomColor(label);
  const backgroundGradient = `linear-gradient(90deg, ${Libs.hexToRgba(COLORS.background, 0.7)} 0%, ${Libs.hexToRgba(COLORS.background, 0.7)} 100%), linear-gradient(90deg, ${tagColor} 0%, ${tagColor} 100%)`;

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose?.(e);
  };

  return (
    <Atoms.Toggle
      {...rest}
      pressed={selected}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      data-cy="post-tag"
      data-tag-label={label}
      className={Libs.cn(
        'group relative h-8 max-w-full gap-1 rounded-md px-3 backdrop-blur-lg',
        'border-0 text-sm leading-5 font-bold text-white',
        'transition-all duration-200',
        // Override Toggle default hover styles - keep text white
        'hover:bg-transparent hover:text-white',
        // Selected state - add border
        'data-[state=on]:border data-[state=on]:border-solid data-[state=on]:bg-transparent data-[state=on]:text-white',
        className,
      )}
      style={{
        backgroundImage: backgroundGradient,
        boxShadow: selected ? `inset 0 0 0 1px ${tagColor}` : undefined,
      }}
      aria-label={count !== undefined ? `${label} tag (${count} posts)` : `${label} tag`}
    >
      {/* Tag content */}
      <span className="flex min-w-0 items-center gap-1.5 text-sm leading-5">
        <span data-cy="post-tag-label" className="truncate font-bold">
          {label}
        </span>
        {count !== undefined && (
          <span data-cy="post-tag-count" className="shrink-0 font-medium opacity-50">
            {count}
          </span>
        )}
      </span>

      {/* Close button */}
      {showClose && (
        <span
          onClick={handleClose}
          className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded opacity-70 transition-opacity hover:opacity-100"
          aria-label={`Remove ${label} tag`}
          role="button"
        >
          <Libs.X className="size-3" strokeWidth={2} />
        </span>
      )}

      {/* Hover shadow overlay - exactly as Figma */}
      <span
        className="pointer-events-none absolute inset-0 rounded-md opacity-0 transition-opacity group-hover:opacity-100"
        style={{
          boxShadow: `inset 0px 0px 8px 0px ${tagColor}`,
        }}
        aria-hidden="true"
      />

      {/* Selected border overlay */}
      {selected && (
        <span
          className="pointer-events-none absolute inset-0 rounded-md border border-solid"
          style={{ borderColor: tagColor }}
          aria-hidden="true"
        />
      )}
    </Atoms.Toggle>
  );
}
