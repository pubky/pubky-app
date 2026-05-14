'use client';

/**
 * NewPostsButton
 *
 * A prominent button that appears when new posts are available.
 * When at the top of the page, it appears below the input, full width.
 * When scrolled down, it becomes a fixed floating button at the top.
 *
 * @example
 * ```tsx
 * <NewPostsButton
 *   count={5}
 *   onClick={() => handleNewPosts()}
 *   visible={hasNewPosts}
 *   isScrolled={isScrolled}
 * />
 * ```
 */
import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { cn } from '@/libs/utils/utils';
import type { NewPostsButtonProps } from './NewPostsButton.types';

export function NewPostsButton({ count, onClick, visible, isScrolled = false }: NewPostsButtonProps) {
  const t = useTranslations('post');
  if (!visible || count === 0) return null;
  return (
    <Button
      variant={isScrolled ? 'brand' : 'default'}
      onClick={onClick}
      data-cy="new-posts-button"
      data-testid="new-posts-button"
      className={cn(
        'animate-in fade-in slide-in-from-left-2',
        // When scrolled: fixed position floating below main header (uses --header-offset-main CSS variable)
        isScrolled && 'fixed top-(--header-offset-main) left-1/2 z-30 -translate-x-1/2 shadow-lg',
        // When at top: full width below input
        !isScrolled && 'w-full',
      )}
    >
      <ArrowUp className={cn('h-4 w-4', !isScrolled && 'animate-bounce')} />
      <span>
        {count === 1
          ? t('newPostsSingular', {
              count,
            })
          : t('newPostsPlural', {
              count,
            })}
      </span>
    </Button>
  );
}
