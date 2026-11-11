'use client';
import { Smartphone } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { useSmsVerificationInfo } from '@/hooks/useSmsVerificationInfo/useSmsVerificationInfo';
import { cn } from '@/libs/utils/utils';
import { HumanVerificationStatus } from '../HumanVerificationStatus/HumanVerificationStatus';
import { IllustratedCard } from '../IllustratedCard/IllustratedCard';
import { HumanSmsCardSkeleton } from './HumanSmsCard.skeleton';
import type { HumanSmsCardProps } from './HumanSmsCard.types';

export const HumanSmsCard = ({ onClick }: HumanSmsCardProps) => {
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
    <Container className="contents lg:relative lg:flex lg:min-w-0">
      <IllustratedCard
        data-testid="sms-verification-card"
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
            src="/images/sms-verification-phone.webp"
            alt="Lime Pubky phone representing phone number verification"
            width={192}
            height={192}
            className="size-48"
          />
        }
      >
        <Container className="hidden gap-3 lg:flex">
          <Typography as="h3" className="text-xl leading-7 font-bold text-foreground lg:text-2xl lg:leading-8">
            {'Phone verification'}
          </Typography>
          <Typography as="p" className="text-xs leading-4 font-medium tracking-widest text-muted-foreground uppercase">
            {'Easy and free'}
          </Typography>
        </Container>

        <div className="relative lg:mt-auto">
          <Button
            data-testid="human-sms-card-receive-sms-btn"
            variant={ButtonVariant.SECONDARY}
            size="lg"
            className="w-full border-0 disabled:opacity-40"
            onClick={onClick}
            disabled={isUnavailable}
          >
            <Smartphone className="size-4" aria-hidden="true" />
            {'Phone number'}
          </Button>
          {isUnavailable && (
            <div className="lg:hidden">
              <HumanVerificationStatus layout="mobile" reason={isGeoblocked ? 'geoblocked' : 'error'} method="phone" />
            </div>
          )}
        </div>
      </IllustratedCard>

      {isUnavailable && (
        <div className="hidden lg:contents">
          <HumanVerificationStatus
            layout="desktop"
            reason={isGeoblocked ? 'geoblocked' : 'error'}
            method="phone"
            testId={isGeoblocked ? 'geoblock-alert' : 'service-error-alert'}
          />
        </div>
      )}
    </Container>
  );
};
