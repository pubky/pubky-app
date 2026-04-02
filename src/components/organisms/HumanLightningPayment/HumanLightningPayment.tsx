'use client';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useBtcRate } from '@/hooks/useSatUsdRate';
import { useTranslations } from 'next-intl';
import { VerificationHandler } from './HumanLightningPayment.utils';
import { QRCodeSkeleton, PriceSkeleton } from './HumanLightningPayment.skeleton';
import type { HumanLightningPaymentProps } from './HumanLightningPayment.types';
import { useIsMobile } from '@/hooks/useIsMobile';

export const HumanLightningPayment = ({ onBack, onSuccess }: HumanLightningPaymentProps) => {
  const t = useTranslations('onboarding.lightning');
  const tCommon = useTranslations('common');
  const [verification, setVerification] = useState<VerificationHandler | null>(null);
  const verificationRef = React.useRef<VerificationHandler | null>(null);
  const initTimeoutRef = React.useRef<number | null>(null);
  const isMobile = useIsMobile();
  const rate = useBtcRate();
  const [isLoading, setIsLoading] = useState(true);
  const [isPaymentExpired, setIsPaymentExpired] = useState(false);
  const { toast } = Molecules.useToast();

  /**
   * Request a new lightning invoice if the verification is expired or not set.
   */
  const requestLightningInvoice = async () => {
    try {
      setIsLoading(true);
      if (verificationRef.current) {
        verificationRef.current.abort();
      }

      const toastVerificationError = (error: unknown) => {
        toast({
          title: tCommon('error'),
          description: Libs.isAppError(error) ? error.message : t('requestFailedDescription'),
        });
      };
      const onPaymentConfirmed = async (signupCode: string, homeserverPubky: string) => {
        try {
          await onSuccess(signupCode, homeserverPubky);
          toast({ title: t('paymentSuccess') });
        } catch (error) {
          toastVerificationError(error);
        }
      };
      const onPaymentExpired = () => {
        setIsPaymentExpired(true);
        toast({ title: t('paymentExpired') });
      };

      const client = await VerificationHandler.create(onPaymentConfirmed, onPaymentExpired, toastVerificationError);
      verificationRef.current = client;
      setVerification(client);
      setIsPaymentExpired(false);
    } catch {
      toast({
        title: t('requestFailed'),
        description: t('requestFailedDescription'),
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

  async function copyToClipboard(text: string) {
    try {
      await Libs.copyToClipboard({ text });
      toast({
        title: t('invoiceCopied'),
      });
    } catch {
      toast({
        title: t('copyFailed'),
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
      ? t('payAmountUsd', { amount: amountFormatted, usdAmount: usdAmount.toString() })
      : t('payAmount', { amount: amountFormatted });
  };

  const renderExpiredState = (containerClassName: string) => (
    <Atoms.Container className={containerClassName}>
      <Atoms.Typography as="p" className="mb-4 text-base leading-6 font-medium text-secondary-foreground/80">
        {t('expired')}
      </Atoms.Typography>
      <Atoms.Button size="sm" className="rounded-full font-bold" variant="default" onClick={requestLightningInvoice}>
        <Libs.RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        {t('newInvoice')}
      </Atoms.Button>
    </Atoms.Container>
  );

  const renderPaymentAction = () => {
    if (isLoading) return <QRCodeSkeleton />;
    if (!verification) return null;

    if (isPaymentExpired) {
      return renderExpiredState(
        Libs.cn(
          'flex h-[192px] items-center justify-center rounded-[9px] bg-secondary p-[9px]',
          isMobile ? 'w-full' : 'w-[192px]',
        ),
      );
    }

    if (isMobile) {
      return (
        <Atoms.Button asChild className="w-full lg:flex-0">
          <a href={`lightning:${verification.data.bolt11Invoice}`}>
            <Libs.Wallet className="mr-2 size-4" />
            {t('payNow')}
          </a>
        </Atoms.Button>
      );
    }

    return (
      <Atoms.Container
        overrideDefaults={true}
        className="relative flex cursor-pointer items-center justify-center rounded-[9px] bg-white p-[9px]"
        onClick={() => copyToClipboard(verification.data.bolt11Invoice)}
      >
        <QRCodeSVG value={verification.data.bolt11Invoice} size={174} />
        <Atoms.Container
          overrideDefaults
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <Atoms.Image src="/images/bitcoin-logo.svg" alt="Bitcoin logo" width={45} height={45} />
        </Atoms.Container>
      </Atoms.Container>
    );
  };

  return (
    <React.Fragment>
      <Atoms.PageHeader>
        <Molecules.PageTitle size="large">
          {t.rich(isMobile ? 'title_mobile' : 'title', {
            highlight: (chunks) => (
              <Atoms.Typography as="span" overrideDefaults className="text-brand">
                {chunks}
              </Atoms.Typography>
            ),
          })}
        </Molecules.PageTitle>
        <Atoms.PageSubtitle>{t('subtitle')}</Atoms.PageSubtitle>
      </Atoms.PageHeader>

      <Atoms.Card
        data-testid="human-lightning-payment-card"
        className="flex flex-col-reverse items-start gap-6 p-6 lg:flex-row lg:gap-12 lg:p-12"
      >
        {/* Payment QR code */}

        <Atoms.Container
          overrideDefaults={true}
          className="flex h-full w-full flex-col items-center justify-center lg:w-auto"
        >
          {renderPaymentAction()}
        </Atoms.Container>

        {/* Description */}
        <Atoms.Container className="w-full flex-col gap-3">
          <Atoms.Typography as="h3" className="text-2xl leading-[32px] font-semibold text-foreground">
            {t('qrLabel')}
          </Atoms.Typography>
          {isDataAvailable ? (
            <React.Fragment>
              <Atoms.Typography as="p" className="text-5xl leading-none font-semibold text-brand lg:text-6xl">
                ₿ {verification.data.amountSat.toLocaleString('en-US')}
              </Atoms.Typography>
              <Atoms.Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
                {getPaymentDescription()}
              </Atoms.Typography>
            </React.Fragment>
          ) : (
            <PriceSkeleton />
          )}
        </Atoms.Container>
      </Atoms.Card>

      {/* Buttons container */}
      <Atoms.Container className={Libs.cn('mt-6 justify-between gap-3 sm:flex-row lg:gap-6')}>
        <Atoms.Button
          id="human-phone-back-btn"
          size="lg"
          className="w-full flex-1 rounded-full lg:flex-0"
          variant="secondary"
          onClick={onBack}
        >
          <Libs.ArrowLeft className="mr-2 h-4 w-4" />
          {tCommon('back')}
        </Atoms.Button>
        <Atoms.Button
          id="human-phone-send-code-btn"
          size="lg"
          className="w-full flex-1 rounded-full lg:flex-0"
          variant={isMobile ? 'secondary' : 'default'}
          disabled={!isDataAvailable}
          onClick={() => verification && copyToClipboard(verification.data.bolt11Invoice)}
        >
          <Libs.Copy className="mr-2 h-4 w-4" />
          {t('copyInvoice')}
        </Atoms.Button>
      </Atoms.Container>
    </React.Fragment>
  );
};
