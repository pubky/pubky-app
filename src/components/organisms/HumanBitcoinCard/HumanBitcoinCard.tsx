'use client';
import { Wallet } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { useLnVerificationInfo } from '@/hooks/useLnVerificationInfo/useLnVerificationInfo';
import { useBtcRate } from '@/hooks/useSatUsdRate/useSatUsdRate';
import { cn } from '@/libs/utils/utils';
import { HumanVerificationStatus } from '@/molecules/HumanVerificationStatus/HumanVerificationStatus';
import { IllustratedCard } from '@/molecules/IllustratedCard/IllustratedCard';
import { HumanBitcoinCardSkeleton } from './HumanBitcoinCard.skeleton';
import type { HumanBitcoinCardProps } from './HumanBitcoinCard.types';

export const HumanBitcoinCard = ({ onClick }: HumanBitcoinCardProps) => {
  const { rate, status: rateStatus } = useBtcRate();
  const satUsdRate = rate?.satUsd;
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
    <Container className="contents lg:relative lg:flex lg:min-w-0">
      <IllustratedCard
        data-testid="bitcoin-payment-card"
        className={cn(
          'contents lg:flex lg:flex-1 lg:rounded-md',
          isUnavailable && 'lg:pointer-events-none lg:opacity-50 lg:blur-xs',
        )}
        layout="column"
        layoutClassName="contents lg:flex lg:flex-1 lg:gap-6"
        contentClassName="contents lg:flex"
        visualClassName="mx-auto"
        visual={
          <Image
            priority
            src="/images/bitcoin-payment.webp"
            alt="Lime Pubky coins representing Bitcoin payments"
            width={192}
            height={192}
            className="size-48"
          />
        }
      >
        <Container className="hidden gap-3 lg:flex">
          <Typography as="h3" className="text-xl leading-7 font-bold text-foreground lg:text-2xl lg:leading-8">
            {'Small payment'}
          </Typography>
          <Typography as="p" className="text-xs leading-4 font-medium tracking-widest text-muted-foreground uppercase">
            {formattedPrice ? `Pay ₿${formattedPrice} for secure verification` : 'Secure verification'}
          </Typography>
        </Container>

        <div className="relative lg:mt-auto">
          <Button
            variant={ButtonVariant.SECONDARY}
            size="lg"
            className="w-full border-0 disabled:opacity-40"
            onClick={onClick}
            disabled={priceSat === undefined || isUnavailable}
          >
            <Wallet className="size-4" aria-hidden="true" />
            {usdAmount !== undefined ? `Bitcoin payment ($${usdAmount})` : 'Bitcoin payment'}
            {!isUnavailable && rateStatus === 'loading' && <Skeleton className="h-4 w-8 rounded" />}
          </Button>
          {isUnavailable && (
            <div className="lg:hidden">
              <HumanVerificationStatus
                layout="mobile"
                reason={isGeoBlocked ? 'geoblocked' : 'error'}
                method="payment"
              />
            </div>
          )}
        </div>
      </IllustratedCard>

      {isUnavailable && (
        <div className="hidden lg:contents">
          <HumanVerificationStatus
            layout="desktop"
            reason={isGeoBlocked ? 'geoblocked' : 'error'}
            method="payment"
            testId={isGeoBlocked ? 'geo-block-alert' : 'service-error-alert'}
          />
        </div>
      )}
    </Container>
  );
};
