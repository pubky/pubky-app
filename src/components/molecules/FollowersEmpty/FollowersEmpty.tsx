'use client';

import Image from 'next/image';
import { Plus, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';

export function FollowersEmpty() {
  const t = useTranslations('profile.empty.followers');

  return (
    <Container data-cy="profile-followers-empty" className="relative items-center gap-6 px-0 py-6">
      {/* Background image */}
      <Image
        src="/images/connections-empty-state.webp"
        alt={t('alt')}
        fill
        className="pointer-events-none object-contain object-center"
        aria-hidden="true"
      />

      {/* Icon */}
      <Container overrideDefaults={true} className="flex items-center rounded-full bg-brand/16 p-6">
        <UsersRound className="size-12 text-brand" strokeWidth={1.5} />
      </Container>

      {/* Title and subtitle */}
      <Container className="items-center gap-6">
        <Typography as="h3" size="lg">
          {t('title')}
        </Typography>

        <Typography className="text-center text-base leading-6 font-medium text-secondary-foreground">
          {t('subtitle')
            .split('\n')
            .map((line, i) => (
              <span key={i}>
                {line}
                {i === 0 && <br />}
              </span>
            ))}
        </Typography>
      </Container>

      {/* CTA */}
      <Button variant="default" size="default" className="gap-2">
        <Plus className="size-4" />
        <Typography as="span" overrideDefaults={true}>
          {t('createPost')}
        </Typography>
      </Button>
    </Container>
  );
}
