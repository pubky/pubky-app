'use client';

import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { ContinueWithPassport } from '@/molecules/ContinueWithPassport/ContinueWithPassport';
import { IllustratedCard } from '@/molecules/IllustratedCard/IllustratedCard';
import type { PassportMethodCardProps } from './PassportMethodCard.types';

export const PASSPORT_METHOD_TITLE = 'Quick & Easy';
export const PASSPORT_METHOD_DESCRIPTION = 'Use your existing sign-in methods.';

/**
 * Desktop "Quick & Easy" method card: cloud illustration, title, description and the
 * "Continue with Google" button. Sits next to the sovereign (Pubky Ring / own keys) card on
 * `/sign-in` and `/onboarding/join`. The parent owns the Passport attempt.
 */
export function PassportMethodCard({ onContinue, isPending, className }: PassportMethodCardProps) {
  return (
    <IllustratedCard
      data-testid="passport-method-card"
      className={cn('flex-1 rounded-md', className)}
      visual={
        <Image
          priority
          src="/images/passport-cloud.webp"
          alt="Lime cloud representing an account backed by an existing sign-in provider"
          width={192}
          height={192}
          className="size-48"
        />
      }
    >
      <Container className="gap-3">
        <Typography as="h3" size="lg" className="leading-8">
          {PASSPORT_METHOD_TITLE}
        </Typography>
        <Typography as="p" className="leading-6 text-secondary-foreground/80">
          {PASSPORT_METHOD_DESCRIPTION}
        </Typography>
      </Container>
      <ContinueWithPassport onContinue={onContinue} isPending={isPending} />
    </IllustratedCard>
  );
}

/**
 * Compact mobile Passport card shared by Join and sign-in.
 */
export function PassportMethodSection({ onContinue, isPending, className }: PassportMethodCardProps) {
  return (
    <Container data-testid="passport-method-section" className={cn('gap-4 rounded-md bg-card p-6', className)}>
      <Typography as="h3" className="text-xl leading-7 font-bold">
        {PASSPORT_METHOD_TITLE}
      </Typography>
      <ContinueWithPassport onContinue={onContinue} isPending={isPending} />
    </Container>
  );
}
