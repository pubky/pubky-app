import * as React from 'react';
import * as Libs from '@/libs';
import * as Atoms from '@/atoms';
import type { PostTagAddButtonProps } from './PostTagAddButton.types';
import { Plus } from 'lucide-react';
export function PostTagAddButton({ onClick, className, disabled }: PostTagAddButtonProps) {
  return (
    <Atoms.Button
      data-cy="post-tag-add-button"
      onClick={onClick}
      variant="outline"
      size="sm"
      disabled={disabled}
      className={Libs.cn(
        'size-8 min-w-8! rounded-md border-dashed bg-transparent p-0 transition-opacity hover:bg-transparent hover:opacity-80',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      aria-label="Add new tag"
    >
      <Plus className="size-4 opacity-[0.32]" strokeWidth={2} />
    </Atoms.Button>
  );
}
