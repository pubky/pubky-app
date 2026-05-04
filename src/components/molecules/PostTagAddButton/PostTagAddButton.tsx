import * as React from 'react';
import { Button } from '@/atoms/Button/Button';

import type { PostTagAddButtonProps } from './PostTagAddButton.types';
import { Plus } from 'lucide-react';
import { cn } from '@/libs/utils/utils';

export function PostTagAddButton({ onClick, className, disabled, variant = 'dashed' }: PostTagAddButtonProps) {
  return (
    <Button
      data-cy="post-tag-add-button"
      onClick={onClick}
      variant="outline"
      size="sm"
      disabled={disabled}
      className={cn(
        'relative size-8 min-w-8! rounded-md bg-transparent p-0! transition-opacity hover:bg-transparent hover:opacity-80',
        'gap-0! px-0! has-[>svg]:px-0!',
        variant === 'dashed' && 'border-dashed',
        variant === 'plain' && 'border-transparent shadow-none hover:border-transparent hover:shadow-none',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      aria-label="Add new tag"
    >
      <Plus
        className="pointer-events-none absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 opacity-[0.32]"
        strokeWidth={2}
      />
    </Button>
  );
}
