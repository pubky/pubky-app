'use client';

import { type MouseEvent } from 'react';
import { Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { cn } from '@/libs/utils/utils';

interface PostTagToggleButtonProps {
  postId: string;
  expanded: boolean;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
}

export function PostTagToggleButton({ postId, expanded, onToggle, disabled, className }: PostTagToggleButtonProps) {
  const t = useTranslations('post.actions');
  const { postCounts, isLoading } = usePostCounts(postId);
  const tagCount = postCounts?.unique_tags ?? 0;

  if (isLoading) {
    return <Skeleton data-cy="post-tag-btn-skeleton" className="h-8 w-12 rounded-full" />;
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onToggle}
      disabled={disabled}
      aria-expanded={expanded}
      aria-label={t('tagPost', { count: tagCount })}
      data-cy="post-tag-btn"
      className={cn('border-none shadow-xs', className)}
    >
      <Tag />
      <Typography as="span" overrideDefaults className="text-xs leading-4 font-bold text-muted-foreground">
        {tagCount}
      </Typography>
    </Button>
  );
}
