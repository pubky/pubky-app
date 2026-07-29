'use client';
import { Check, TriangleAlert, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/atoms/Badge/Badge';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { useLnVerificationInfo } from '@/hooks/useLnVerificationInfo/useLnVerificationInfo';
import { useBtcRate } from '@/hooks/useSatUsdRate/useSatUsdRate';
import { cn } from '@/libs/utils/utils';
import { IllustratedCard } from '@/molecules/IllustratedCard/IllustratedCard';
import { HumanBitcoinCardSkeleton, PriceSkeleton } from './HumanBitcoinCard.skeleton';
import type { HumanBitcoinCardProps } from './HumanBitcoinCard.types';

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
  const formattedPrice = priceSat?.toLocaleString('en-US');
  let usdAmount: string | undefined;
  if (priceSat !== undefined && satUsdRate !== undefined) {
    usdAmount = (Math.round(satUsdRate * priceSat * 100) / 100).toFixed(2);
  } else {
    usdAmount = undefined;
  }

  if (isLoading) {
    return <HumanBitcoinCardSkeleton />;
  }

  return (
    <Container className="relative flex-1">
      <IllustratedCard
        data-testid="bitcoin-payment-card"
        className={cn('flex-1 rounded-md', isUnavailable && 'pointer-events-none opacity-60 blur-[5px]')}
        contentClassName="gap-4 lg:gap-6"
        visualClassName="gap-3"
        visual={
          <>
            <Image
              priority
              src="/images/bitcoin-payment.webp"
              alt="Lime Pubky coins representing Bitcoin payments"
              className="size-48"
            />
            <Typography as="p" className="text-center text-xs font-medium tracking-[1.2px] text-brand uppercase">
              {t('morePrivate')}
            </Typography>
          </>
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
            {dataAvailable ? (
              <Badge
                variant="secondary"
                className="rounded-md border-0 bg-brand px-2 py-[2px] text-sm font-semibold tracking-wide text-primary-foreground shadow-sm lg:hidden"
              >
                ₿ {formattedPrice}
              </Badge>
            ) : (
              <PriceSkeleton variant="badge" />
            )}
          </Container>

          {dataAvailable ? (
            <Typography as="p" className="hidden text-5xl leading-none font-bold text-brand lg:block lg:text-6xl">
              ₿ {formattedPrice}
            </Typography>
          ) : (
            <PriceSkeleton variant="price" />
          )}

          {dataAvailable ? (
            <>
              <Typography as="p" className="mt-1 text-sm font-bold text-muted-foreground lg:hidden">
                ₿ {formattedPrice} = $ {usdAmount}
              </Typography>
              <Typography
                as="p"
                className="hidden text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase lg:block"
              >
                ₿{formattedPrice} = ${usdAmount}
              </Typography>
            </>
          ) : (
            <PriceSkeleton variant="conversion" />
          )}

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
          variant={ButtonVariant.DEFAULT}
          className="h-10 w-full shrink-0 rounded-full px-4 text-sm font-bold lg:w-auto lg:self-start"
          onClick={onClick}
          disabled={!dataAvailable || isUnavailable}
        >
          <Wallet className="mr-2 size-4" />
          {t('payOnce')}
        </Button>
      </IllustratedCard>

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
