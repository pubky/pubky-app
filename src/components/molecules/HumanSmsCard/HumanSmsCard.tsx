'use client';
import { Check, Smartphone, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/atoms/Badge/Badge';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { useSmsVerificationInfo } from '@/hooks/useSmsVerificationInfo/useSmsVerificationInfo';
import { cn } from '@/libs/utils/utils';
import { IllustratedCard } from '../IllustratedCard/IllustratedCard';
import { HumanSmsCardSkeleton } from './HumanSmsCard.skeleton';
import type { HumanSmsCardProps } from './HumanSmsCard.types';

export const HumanSmsCard = ({ onClick }: HumanSmsCardProps) => {
  const t = useTranslations('onboarding.phoneNumber');
  const smsInfo = useSmsVerificationInfo();

  // Waiting for availability check
  const isLoading = smsInfo === null;
  // 403 response means geoblocked, not an error
  const isGeoblocked = smsInfo !== null && !smsInfo.available && !smsInfo.error;
  // Generic error from network failure, server error, etc.
  const isError = smsInfo !== null && !smsInfo.available && smsInfo.error === true;
  // Unavailable when either geoblocked or error
  const isUnavailable = isGeoblocked || isError;
  if (isLoading) {
    return <HumanSmsCardSkeleton />;
  }
  return (
    <Container className="relative flex-1">
      <IllustratedCard
        data-testid="sms-verification-card"
        className={cn('flex-1 rounded-md', isUnavailable && 'pointer-events-none opacity-60 blur-[5px]')}
        contentClassName="gap-4 lg:gap-6"
        visual={
          <Image
            priority
            src="/images/sms-verification-phone.webp"
            alt="Lime Pubky phone representing SMS verification"
            className="size-48"
          />
        }
      >
        <Container className="flex-col gap-3">
          <Container className="flex-row items-center justify-between gap-4 lg:justify-start">
            <Typography
              as="h3"
              className="m-0 text-[20px] leading-none font-bold text-foreground lg:text-2xl lg:leading-8"
            >
              {t('title')}
            </Typography>
            <Badge
              variant="secondary"
              className="rounded-md border-0 bg-primary px-2 py-[2px] text-sm font-semibold tracking-wide text-primary-foreground uppercase lg:hidden"
            >
              {t('free')}
            </Badge>
          </Container>

          <Typography as="p" className="hidden text-5xl leading-none font-bold text-brand lg:block lg:text-6xl">
            {t('free')}
          </Typography>

          <Typography
            as="p"
            className="mt-1 text-sm font-bold tracking-widest text-muted-foreground uppercase lg:mt-0 lg:text-xs lg:font-medium lg:tracking-[1.2px]"
          >
            {t('lessPrivate')}
          </Typography>

          <Container className="hidden flex-col lg:flex">
            <Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
              {t('storage')}
            </Typography>
            <Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
              {t('speedLimit')}
            </Typography>
          </Container>
        </Container>

        <Container className="gap-2 lg:hidden">
          <Container className="flex-row items-center gap-2">
            <Check className="size-6 shrink-0 text-foreground" aria-hidden="true" />
            <Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
              {t('storage')}
            </Typography>
          </Container>
          <Container className="flex-row items-center gap-2">
            <Check className="size-6 shrink-0 text-foreground" aria-hidden="true" />
            <Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
              {t('speedLimit')}
            </Typography>
          </Container>
        </Container>

        <Button
          data-testid="human-sms-card-receive-sms-btn"
          variant={ButtonVariant.SECONDARY}
          className="h-10 w-full shrink-0 rounded-full px-4 text-sm font-semibold shadow-xs lg:w-auto lg:self-start"
          onClick={onClick}
          disabled={isUnavailable}
        >
          <Smartphone className="mr-2 size-4" />
          {t('receiveCode')}
        </Button>
      </IllustratedCard>

      {/* Geoblocking overlay badge */}
      {isGeoblocked && (
        <Container
          overrideDefaults
          data-testid="geoblock-alert"
          className="absolute top-1/2 left-1/2 flex h-11 -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-md bg-destructive/60 px-6 py-3 shadow-xl"
        >
          <Container overrideDefaults className="pt-0.5">
            <TriangleAlert className="size-4 text-destructive-foreground" />
          </Container>
          <Typography overrideDefaults className="text-sm font-semibold whitespace-nowrap text-destructive-foreground">
            {t('notAvailable')}
          </Typography>
        </Container>
      )}

      {/* Generic error overlay badge */}
      {isError && (
        <Container
          overrideDefaults
          data-testid="service-error-alert"
          className="absolute top-1/2 left-1/2 flex h-11 -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-md bg-destructive/60 px-6 py-3 shadow-xl"
        >
          <Container overrideDefaults className="pt-0.5">
            <TriangleAlert className="size-4 text-destructive-foreground" />
          </Container>
          <Typography overrideDefaults className="text-sm font-semibold whitespace-nowrap text-destructive-foreground">
            {t('unavailable')}
          </Typography>
        </Container>
      )}
    </Container>
  );
};
