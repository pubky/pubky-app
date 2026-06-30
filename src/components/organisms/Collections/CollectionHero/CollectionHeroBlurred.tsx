'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { ModerationController } from '@/controllers/moderation/moderation';
import { cn } from '@/libs/utils/utils';
import { ModerationBlurOverlay } from '@/molecules/ModerationBlurOverlay/ModerationBlurOverlay';

interface CollectionHeroBlurredProps {
  /** `author:postId` composite id — the moderation record key passed to `unBlur`. */
  compositeId: string;
  className?: string;
}

/**
 * Blurred placeholder for a moderated `CollectionHero`.
 *
 * Mirrors `CollectionHero`'s outer shape (tall rounded banner, `p-8 lg:p-12`
 * body, title → owner → description → tags → actions stack) so the moderated
 * state occupies the same footprint as the real hero — only blurred, with an
 * unblur overlay. The whole banner is a single click-to-unblur button, matching
 * how `PostContentBlurred` handles moderated posts.
 */
export function CollectionHeroBlurred({ compositeId, className }: CollectionHeroBlurredProps) {
  const t = useTranslations('moderation');
  return (
    <Button
      overrideDefaults
      onClick={(e) => {
        e.stopPropagation();
        ModerationController.unBlur(compositeId);
      }}
      className={cn('group relative block w-full cursor-pointer text-left', className)}
    >
      <Card className="relative gap-0 overflow-hidden rounded-md py-0">
        {/* Blurred mock of the real hero layout */}
        <CardContent aria-hidden="true" className="flex flex-col justify-center gap-4 p-8 blur-lg select-none lg:p-12">
          {/* Title */}
          <Typography
            as="h1"
            overrideDefaults
            className="text-5xl leading-tight font-bold wrap-anywhere text-white lg:text-6xl"
          >
            Collection title placeholder
          </Typography>

          {/* Owner + item count */}
          <Container overrideDefaults className="flex w-full items-center gap-6">
            <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2 lg:flex-none">
              <Container overrideDefaults className="size-8 shrink-0 rounded-full bg-white/30" />
              <Container overrideDefaults className="h-5 w-32 rounded-md bg-white/30" />
            </Container>
            <Container overrideDefaults className="h-4 w-10 shrink-0 rounded-md bg-white/30" />
          </Container>

          {/* Description */}
          <Typography
            overrideDefaults
            className="max-w-3xl text-xl leading-8 font-light wrap-anywhere text-white lg:text-2xl"
          >
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et
            dolore magna aliqua.
          </Typography>

          {/* Tags */}
          <Container overrideDefaults className="flex flex-wrap items-center gap-2">
            <Container overrideDefaults className="h-7 w-20 rounded-md bg-white/30" />
            <Container overrideDefaults className="h-7 w-16 rounded-md bg-white/30" />
          </Container>

          {/* Actions */}
          <Container overrideDefaults className="flex flex-wrap items-center gap-3">
            <Container overrideDefaults className="h-8 w-24 rounded-full bg-white/30" />
            <Container overrideDefaults className="h-8 w-20 rounded-full bg-white/30" />
          </Container>
        </CardContent>

        {/* Unblur overlay */}
        <ModerationBlurOverlay label={t('collectionContentModerated')} />
      </Card>
    </Button>
  );
}
