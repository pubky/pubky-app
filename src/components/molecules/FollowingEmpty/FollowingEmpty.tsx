'use client';

import Image from 'next/image';
import { UserRoundPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';

export function FollowingEmpty() {
  const t = useTranslations('profile.empty.following');
  const tNav = useTranslations('profile.navigation');

  return (
    <Container data-cy="profile-following-empty" className="relative items-center gap-6 px-0 py-6">
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
        <UserRoundPlus className="size-12 text-brand" strokeWidth={1.5} />
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

      {/* Action Buttons */}
      <Container className="items-center justify-center gap-3 lg:flex-row">
        <Button variant="secondary" size="default" className="gap-2">
          <UserRoundPlus className="size-4" />
          <Typography as="span" overrideDefaults={true}>
            {tNav('whoToFollow')}
          </Typography>
        </Button>
        <Button variant="secondary" size="default" className="gap-2">
          <UserRoundPlus className="size-4" />
          <Typography as="span" overrideDefaults={true}>
            {tNav('popularUsers')}
          </Typography>
        </Button>
      </Container>
    </Container>
  );
}
