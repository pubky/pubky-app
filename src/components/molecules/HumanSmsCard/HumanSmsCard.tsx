'use client';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import { useSmsVerificationInfo } from '@/hooks/useSmsVerificationInfo';
import { HumanSmsCardSkeleton } from './HumanSmsCard.skeleton';
import type { HumanSmsCardProps } from './HumanSmsCard.types';
import { useTranslations } from 'next-intl';

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
    <Atoms.Container className="relative flex-1">
      <Atoms.Card
        data-testid="sms-verification-card"
        className={Libs.cn('flex-1 gap-0 p-6 md:p-12', isUnavailable && 'pointer-events-none opacity-60 blur-[5px]')}
      >
        <Atoms.Container className="flex-col gap-10 lg:flex-row lg:items-center lg:gap-12">
          <Atoms.Container className="hidden h-full w-full flex-1 items-center lg:block lg:w-auto">
            <Atoms.Image
              priority={true}
              src="/images/sms-verification-phone.webp"
              alt="Lime Pubky phone representing SMS verification"
              className="size-48"
            />
          </Atoms.Container>

          <Atoms.Container className="w-full flex-1 items-start gap-6">
            <Atoms.Container className="gap-3">
              <Atoms.Typography as="h3" className="text-2xl leading-8 font-semibold text-foreground">
                {t('title')}
              </Atoms.Typography>

              <Atoms.Typography as="p" className="text-5xl leading-none font-semibold text-brand lg:text-6xl">
                {t('free')}
              </Atoms.Typography>

              <Atoms.Typography as="p" className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                {t('lessPrivate')}
              </Atoms.Typography>

              <Atoms.Container className="gap-1">
                <Atoms.Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
                  {t('storage')}
                </Atoms.Typography>
                <Atoms.Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
                  {t('speedLimit')}
                </Atoms.Typography>
              </Atoms.Container>
            </Atoms.Container>

            <Atoms.Button
              data-testid="human-sms-card-receive-sms-btn"
              variant={Atoms.ButtonVariant.SECONDARY}
              className="h-10 rounded-full px-4 text-sm font-semibold shadow-xs-dark"
              onClick={onClick}
              disabled={isUnavailable}
            >
              <Libs.Smartphone className="mr-2 size-4" />
              {t('receiveSms')}
            </Atoms.Button>
          </Atoms.Container>
        </Atoms.Container>
      </Atoms.Card>

      {/* Geoblocking overlay badge */}
      {isGeoblocked && (
        <Atoms.Container
          overrideDefaults
          data-testid="geoblock-alert"
          className="absolute top-1/2 left-1/2 flex h-11 -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-md bg-destructive/60 px-6 py-3 shadow-xl"
        >
          <Atoms.Container overrideDefaults className="pt-0.5">
            <Libs.TriangleAlert className="text-destructive-foreground size-4" />
          </Atoms.Container>
          <Atoms.Typography
            overrideDefaults
            className="text-destructive-foreground text-sm font-semibold whitespace-nowrap"
          >
            {t('notAvailable')}
          </Atoms.Typography>
        </Atoms.Container>
      )}

      {/* Generic error overlay badge */}
      {isError && (
        <Atoms.Container
          overrideDefaults
          data-testid="service-error-alert"
          className="absolute top-1/2 left-1/2 flex h-11 -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-md bg-destructive/60 px-6 py-3 shadow-xl"
        >
          <Atoms.Container overrideDefaults className="pt-0.5">
            <Libs.TriangleAlert className="text-destructive-foreground size-4" />
          </Atoms.Container>
          <Atoms.Typography
            overrideDefaults
            className="text-destructive-foreground text-sm font-semibold whitespace-nowrap"
          >
            {t('unavailable')}
          </Atoms.Typography>
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
};
