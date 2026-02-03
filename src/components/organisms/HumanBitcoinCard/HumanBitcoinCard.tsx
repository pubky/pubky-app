'use client';

import * as Atoms from '@/atoms';
import { useBtcRate } from '@/hooks/useSatUsdRate';
import { useLnVerificationInfo } from '@/hooks/useLnVerificationInfo';
import * as Libs from '@/libs';
import { HumanBitcoinCardSkeleton, PriceSkeleton } from './HumanBitcoinCard.skeleton';
import type { HumanBitcoinCardProps } from './HumanBitcoinCard.types';
import { useTranslations } from 'next-intl';

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
    <Atoms.Container className="relative flex-1">
      <Atoms.Card
        data-testid="bitcoin-payment-card"
        className={Libs.cn('flex-1 gap-0 p-6 md:p-12', isUnavailable && 'pointer-events-none opacity-60 blur-[5px]')}
      >
        <Atoms.Container className="flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
          <Atoms.Container className="hidden w-full flex-1 flex-col items-center gap-3 lg:flex lg:w-auto">
            <Atoms.Image
              priority={true}
              src="/images/bitcoin-payment.webp"
              alt="Lime Pubky coins representing Bitcoin payments"
              className="size-48"
            />
            <Atoms.Typography as="p" className="text-center text-xs font-semibold tracking-widest text-brand uppercase">
              {t('morePrivate')}
            </Atoms.Typography>
          </Atoms.Container>

          <Atoms.Container className="w-full flex-1 items-start gap-6">
            <Atoms.Container className="gap-3">
              <Atoms.Typography as="h3" className="text-2xl leading-8 font-semibold text-foreground">
                {t('title')}
              </Atoms.Typography>

              {dataAvailable && priceSat !== undefined && satUsdRate !== undefined ? (
                <>
                  <Atoms.Typography
                    as="p"
                    className="text-5xl leading-none font-semibold whitespace-nowrap text-brand lg:text-6xl"
                  >
                    ₿ {priceSat.toLocaleString('en-US')}
                  </Atoms.Typography>

                  <Atoms.Typography
                    as="p"
                    className="text-xs font-medium tracking-widest text-muted-foreground uppercase"
                  >
                    ₿{priceSat.toLocaleString('en-US')} = ${Math.round(satUsdRate * priceSat * 100) / 100}
                  </Atoms.Typography>
                </>
              ) : (
                <PriceSkeleton />
              )}

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
              variant={Atoms.ButtonVariant.DEFAULT}
              className="h-10 rounded-full px-4 text-sm font-semibold"
              onClick={onClick}
              disabled={!dataAvailable || isUnavailable}
            >
              <Libs.Wallet className="mr-2 size-4" />
              {t('payOnce')}
            </Atoms.Button>
          </Atoms.Container>
        </Atoms.Container>
      </Atoms.Card>

      {/* Geo-blocking overlay badge */}
      {isGeoBlocked && (
        <Atoms.Container
          overrideDefaults
          data-testid="geo-block-alert"
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
