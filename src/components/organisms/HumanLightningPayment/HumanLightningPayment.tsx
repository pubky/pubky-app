'use client';
import React, { useState } from 'react';
import { ArrowLeft, Copy, RefreshCw, Wallet } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useBtcRate } from '@/hooks/useSatUsdRate/useSatUsdRate';
import { isAppError } from '@/libs/error/error.utils';
import { cn, copyToClipboard } from '@/libs/utils/utils';
import { PageTitle } from '@/molecules/Page/Page';
import { toast } from '@/molecules/Toaster/toast';
import { PriceSkeleton, QRCodeSkeleton } from './HumanLightningPayment.skeleton';
import type { HumanLightningPaymentProps } from './HumanLightningPayment.types';
import { VerificationHandler } from './HumanLightningPayment.utils';

export const HumanLightningPayment = ({ onBack, onSuccess }: HumanLightningPaymentProps) => {
  const [verification, setVerification] = useState<VerificationHandler | null>(null);
  const verificationRef = React.useRef<VerificationHandler | null>(null);
  const initTimeoutRef = React.useRef<number | null>(null);
  const isMobile = useIsMobile();
  const rate = useBtcRate();
  const [isLoading, setIsLoading] = useState(true);
  const [isPaymentExpired, setIsPaymentExpired] = useState(false);

  /**
   * Request a new lightning invoice if the verification is expired or not set.
   */
  const requestLightningInvoice = async () => {
    try {
      setIsLoading(true);
      if (verificationRef.current) {
        verificationRef.current.abort();
      }
      const onVerificationError = (error: unknown) => {
        toast({
          variant: 'error',
          description: isAppError(error) ? error.message : 'Could not request Lightning invoice. Try again later.',
        });
      };
      const onPaymentConfirmed = async (signupCode: string, homeserverPubky: string) => {
        try {
          await onSuccess(signupCode, homeserverPubky);
          toast({
            title: 'Payment successful',
          });
        } catch (error) {
          onVerificationError(error);
        }
      };
      const onPaymentExpired = () => {
        setIsPaymentExpired(true);
        toast({
          variant: 'warning',
          title: 'Payment expired',
        });
      };
      const client = await VerificationHandler.create(onPaymentConfirmed, onPaymentExpired, onVerificationError);
      verificationRef.current = client;
      setVerification(client);
      setIsPaymentExpired(false);
    } catch {
      toast({
        variant: 'error',
        description: 'Could not request Lightning invoice. Try again later.',
      });
    } finally {
      setIsLoading(false);
    }
  };
  React.useEffect(() => {
    if (typeof window === 'undefined') return; // No SSR

    // In React Strict Mode (dev), the first mount is intentionally thrown away.
    // Delay side effects to the next tick so cleanup can cancel that throwaway run.
    initTimeoutRef.current = window.setTimeout(() => {
      void requestLightningInvoice();
    }, 0);

    // Cleanup: abort verification polling when component unmounts
    return () => {
      if (initTimeoutRef.current !== null) {
        window.clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      if (verificationRef.current) {
        verificationRef.current.abort();
        verificationRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);
  async function copyInvoiceToClipboard(text: string) {
    try {
      await copyToClipboard({
        text,
      });
      toast({
        variant: 'info',
        title: 'Invoice copied to clipboard',
      });
    } catch {
      toast({
        variant: 'error',
        description: 'Could not copy invoice.',
      });
    }
  }
  const isDataAvailable = verification !== null && !isLoading;

  // Format the payment description with optional USD conversion
  const getPaymentDescription = () => {
    if (!verification) return '';
    const amountFormatted = verification.data.amountSat.toLocaleString('en-US');
    const usdAmount = rate?.satUsd ? Math.round(rate.satUsd * verification.data.amountSat * 100) / 100 : null;
    return usdAmount
      ? `Pay ₿ ${amountFormatted} ($${usdAmount.toString()}) to continue.`
      : `Pay ₿ ${amountFormatted} to continue.`;
  };
  const renderExpiredState = (containerClassName: string) => (
    <Container className={containerClassName}>
      <Typography as="p" className="mb-4 text-base leading-6 font-medium text-secondary-foreground/80">
        {'Payment expired'}
      </Typography>
      <Button size="sm" className="rounded-full font-bold" variant="default" onClick={requestLightningInvoice}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        {'New invoice'}
      </Button>
    </Container>
  );
  const renderPaymentAction = () => {
    if (isLoading) return <QRCodeSkeleton />;
    if (!verification) return null;
    if (isPaymentExpired) {
      return renderExpiredState(
        cn(
          'flex h-[192px] items-center justify-center rounded-[9px] bg-secondary p-[9px]',
          isMobile ? 'w-full' : 'w-[192px]',
        ),
      );
    }
    if (isMobile) {
      return (
        <Button asChild className="w-full lg:flex-0">
          <a href={`lightning:${verification.data.bolt11Invoice}`}>
            <Wallet className="mr-2 size-4" />
            {'Pay now'}
          </a>
        </Button>
      );
    }
    return (
      <Container
        overrideDefaults={true}
        className="relative flex cursor-pointer items-center justify-center rounded-[9px] bg-white p-[9px]"
        onClick={() => copyInvoiceToClipboard(verification.data.bolt11Invoice)}
      >
        <QRCodeSVG value={verification.data.bolt11Invoice} size={174} />
        <Container overrideDefaults className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Image src="/images/bitcoin-logo.svg" alt="Bitcoin logo" width={45} height={45} />
        </Container>
      </Container>
    );
  };
  return (
    <React.Fragment>
      <PageHeader>
        <PageTitle size="large">
          {isMobile ? 'Tap to ' : 'Scan to '}
          <Typography as="span" overrideDefaults className="text-brand">
            {'Pay.'}
          </Typography>
        </PageTitle>
        <PageSubtitle>{'Scan the QR code with your favorite wallet.'}</PageSubtitle>
      </PageHeader>

      <Card
        data-testid="human-lightning-payment-card"
        className="flex flex-col-reverse items-start gap-6 p-6 lg:flex-row lg:gap-12 lg:p-12"
      >
        {/* Payment QR code */}

        <Container
          overrideDefaults={true}
          className="flex h-full w-full shrink-0 flex-col items-center justify-center lg:w-auto"
        >
          {renderPaymentAction()}
        </Container>

        {/* Description */}
        <div className="flex w-full min-w-0 flex-col gap-3 lg:max-w-xl lg:flex-1">
          <Typography as="h3" className="text-2xl leading-[32px] font-semibold text-foreground">
            {'Bitcoin Lightning Payment'}
          </Typography>
          {isDataAvailable ? (
            <React.Fragment>
              <Typography as="p" className="text-5xl leading-none font-semibold text-brand lg:text-6xl">
                ₿ {verification.data.amountSat.toLocaleString('en-US')}
              </Typography>
              <Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
                {getPaymentDescription()}
              </Typography>
            </React.Fragment>
          ) : (
            <PriceSkeleton />
          )}
        </div>
      </Card>

      {/* Buttons container */}
      <Container className={cn('mt-6 justify-between gap-3 sm:flex-row lg:gap-6')}>
        <Button
          id="human-phone-back-btn"
          size="lg"
          className="w-full flex-1 rounded-full lg:flex-0"
          variant="secondary"
          onClick={onBack}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {'Back'}
        </Button>
        <Button
          id="human-phone-send-code-btn"
          size="lg"
          className="w-full flex-1 rounded-full lg:flex-0"
          variant={isMobile ? 'secondary' : 'default'}
          disabled={!isDataAvailable}
          onClick={() => verification && copyInvoiceToClipboard(verification.data.bolt11Invoice)}
        >
          <Copy className="mr-2 h-4 w-4" />
          {'Copy Invoice'}
        </Button>
      </Container>
    </React.Fragment>
  );
};
