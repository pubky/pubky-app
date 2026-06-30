'use client';

import { Library } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { ModerationController } from '@/controllers/moderation/moderation';
import { cn } from '@/libs/utils/utils';
import { ModerationBlurOverlay } from '@/molecules/ModerationBlurOverlay/ModerationBlurOverlay';

interface CollectionCardBlurredProps {
  /** `author:postId` composite id — the moderation record key passed to `unBlur`. */
  compositeId: string;
  className?: string;
}

/**
 * Blurred placeholder for a moderated `CollectionCard`.
 *
 * Mirrors `CollectionCard`'s outer shape (rounded card, `p-6` body, header +
 * description + tag/action rows) so the moderated state occupies the same
 * footprint as the real card — only blurred, with an unblur overlay. The whole
 * card is a single click-to-unblur button (no navigation), matching how
 * `PostContentBlurred` handles moderated posts.
 */
export function CollectionCardBlurred({ compositeId, className }: CollectionCardBlurredProps) {
  const t = useTranslations('moderation');
  return (
    <Button
      overrideDefaults
      onClick={(e) => {
        e.stopPropagation();
        ModerationController.unBlur(compositeId);
      }}
      className={cn('group relative block h-full w-full cursor-pointer text-left lg:max-w-187', className)}
    >
      <Card className="relative isolate h-full gap-0 overflow-hidden rounded-md py-0">
        {/* Blurred mock of the real card layout */}
        <CardContent aria-hidden="true" className="flex h-full flex-col gap-3 p-6 blur-lg select-none">
          {/* Header row: icon + title (left) | count + avatar (right) */}
          <Container overrideDefaults className="flex w-full flex-wrap items-center gap-3 sm:flex-nowrap">
            <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
              <Library className="size-6 shrink-0 text-white" />
              <Typography
                as="span"
                overrideDefaults
                className="min-w-0 flex-1 truncate text-xl leading-7 font-bold text-white"
              >
                Collection title placeholder
              </Typography>
            </Container>

            <Container overrideDefaults className="flex shrink-0 items-center justify-end gap-3">
              <Container overrideDefaults className="h-3 w-6 rounded-md bg-white/30" />
              <Container overrideDefaults className="size-9 shrink-0 rounded-full bg-white/30" />
            </Container>
          </Container>

          {/* Description */}
          <Typography
            overrideDefaults
            className="line-clamp-2 w-full min-w-0 text-base leading-6 font-medium wrap-anywhere text-white"
          >
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.
          </Typography>

          {/* Bottom row: tag chips (left) | action button (right). `mt-auto`
              pins it to the bottom when the card stretches to match a taller
              sibling in the same row (mirrors how the real cards align). */}
          <Container
            overrideDefaults
            className="mt-auto flex w-full flex-wrap items-center justify-between gap-3 sm:flex-nowrap"
          >
            <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
              <Container overrideDefaults className="h-7 w-20 rounded-md bg-white/30" />
              <Container overrideDefaults className="h-7 w-24 rounded-md bg-white/30" />
            </Container>
            <Container overrideDefaults className="h-8 w-28 shrink-0 rounded-md bg-white/30" />
          </Container>
        </CardContent>

        {/* Unblur overlay */}
        <ModerationBlurOverlay label={t('collectionContentModerated')} />
      </Card>
    </Button>
  );
}
