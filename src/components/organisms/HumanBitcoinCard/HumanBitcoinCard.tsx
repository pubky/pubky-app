'use client';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';

import { useBtcRate } from '@/hooks/useSatUsdRate/useSatUsdRate';
import { useLnVerificationInfo } from '@/hooks/useLnVerificationInfo/useLnVerificationInfo';
import { HumanBitcoinCardSkeleton, PriceSkeleton } from './HumanBitcoinCard.skeleton';
import type { HumanBitcoinCardProps } from './HumanBitcoinCard.types';
import { useTranslations } from 'next-intl';
import { Wallet, TriangleAlert } from 'lucide-react';
import { cn } from '@/libs/utils/utils';

export const HumanBitcoinCard = ({ onClick }: HumanBitcoinCardProps) => {
  const t = useTranslations('onboarding.bitcoin');
  const satUsdRate = useBtcRate()?.satUsd;
  const lnInfo = useLnVerificationInfo();

  // Waiting for availability check
  const isLoading = lnInfo === null;
  // 403 response means geo blocked, not an error
  const isGeoBlocked = lnInfo !== null && !lnInfo.available && !lnInfo.error;
  // Generic error from network failure, server error, etc.
  const isError = lnInfo !== null && !lnInfo.available && lnInfo.error === true;
  // Unavailable when either geo blocked or error
  const isUnavailable = isGeoBlocked || isError;
  // Price when available
  const priceSat = lnInfo?.available ? lnInfo.amountSat : undefined;
  const dataAvailable = priceSat !== undefined && satUsdRate !== undefined;
  if (isLoading) {
    return <HumanBitcoinCardSkeleton />;
  }
  return (
    <Container className="relative flex-1">
      <Card
        data-testid="bitcoin-payment-card"
        className={cn('flex-1 gap-0 p-6 md:p-12', isUnavailable && 'pointer-events-none opacity-60 blur-[5px]')}
      >
        <Container className="flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
          <Container className="hidden w-full flex-1 flex-col items-center gap-3 lg:flex lg:w-auto">
            <Image
              priority={true}
              src="/images/bitcoin-payment.webp"
              alt="Lime Pubky coins representing Bitcoin payments"
              className="size-48"
            />
            <Typography as="p" className="text-center text-xs font-semibold tracking-widest text-brand uppercase">
              {t('morePrivate')}
            </Typography>
          </Container>

          <Container className="w-full flex-1 items-start gap-6">
            <Container className="gap-3">
              <Typography as="h3" className="text-2xl leading-8 font-semibold text-foreground">
                {t('title')}
              </Typography>

              {dataAvailable && priceSat !== undefined && satUsdRate !== undefined ? (
                <>
                  <Typography
                    as="p"
                    className="text-5xl leading-none font-semibold whitespace-nowrap text-brand lg:text-6xl"
                  >
                    ₿ {priceSat.toLocaleString('en-US')}
                  </Typography>

                  <Typography as="p" className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    ₿{priceSat.toLocaleString('en-US')} = ${Math.round(satUsdRate * priceSat * 100) / 100}
                  </Typography>
                </>
              ) : (
                <PriceSkeleton />
              )}

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
              variant={ButtonVariant.DEFAULT}
              className="h-10 rounded-full px-4 text-sm font-semibold"
              onClick={onClick}
              disabled={!dataAvailable || isUnavailable}
            >
              <Wallet className="mr-2 size-4" />
              {t('payOnce')}
            </Button>
          </Container>
        </Container>
      </Card>

      {/* Geo-blocking overlay badge */}
      {isGeoBlocked && (
        <Container
          overrideDefaults
          data-testid="geo-block-alert"
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
