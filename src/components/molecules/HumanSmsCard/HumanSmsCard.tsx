'use client';
import { Smartphone, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { useSmsVerificationInfo } from '@/hooks/useSmsVerificationInfo/useSmsVerificationInfo';
import { cn } from '@/libs/utils/utils';
import { HumanSmsCardSkeleton } from './HumanSmsCard.skeleton';
import type { HumanSmsCardProps } from './HumanSmsCard.types';

export const HumanSmsCard = ({ onClick }: HumanSmsCardProps) => {
  const t = useTranslations('onboarding.sms');
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
      <Card
        data-testid="sms-verification-card"
        className={cn('flex-1 gap-0 p-6 md:p-12', isUnavailable && 'pointer-events-none opacity-60 blur-[5px]')}
      >
        <Container className="flex-col gap-10 lg:flex-row lg:items-center lg:gap-12">
          <Container className="hidden h-full w-full flex-1 items-center lg:block lg:w-auto">
            <Image
              priority={true}
              src="/images/sms-verification-phone.webp"
              alt="Lime Pubky phone representing SMS verification"
              className="size-48"
            />
          </Container>

          <Container className="w-full flex-1 items-start gap-6">
            <Container className="gap-3">
              <Typography as="h3" className="text-2xl leading-8 font-semibold text-foreground">
                {t('title')}
              </Typography>

              <Typography as="p" className="text-5xl leading-none font-semibold text-brand lg:text-6xl">
                {t('free')}
              </Typography>

              <Typography as="p" className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                {t('lessPrivate')}
              </Typography>

              <Container className="gap-1">
                <Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
                  {t('storage')}
                </Typography>
                <Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
                  {t('speedLimit')}
                </Typography>
              </Container>
            </Container>

            <Button
              data-testid="human-sms-card-receive-sms-btn"
              variant={ButtonVariant.SECONDARY}
              className="h-10 rounded-full px-4 text-sm font-semibold shadow-xs"
              onClick={onClick}
              disabled={isUnavailable}
            >
              <Smartphone className="mr-2 size-4" />
              {t('receiveSms')}
            </Button>
          </Container>
        </Container>
      </Card>

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
