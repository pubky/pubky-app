import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import type { QrCodeSlotProps } from './QrCodeSlot.types';

const DEFAULT_QR_SIZE = 176;
const DEFAULT_RING_LOGO_SIZE = 48;
const HOVER_OPACITY = 'transition-opacity group-hover:opacity-90 group-active:opacity-80';

export function QrCodeSlot({
  isLoading,
  isExpired,
  url,
  generatingLabel,
  clickToReloadLabel,
  size = DEFAULT_QR_SIZE,
  activeQrHasHoverEffect = false,
  expiredReloadAction,
}: QrCodeSlotProps) {
  const ringLogoSize = Math.round((DEFAULT_RING_LOGO_SIZE / DEFAULT_QR_SIZE) * size);

  if (isLoading || (!url && !isExpired)) {
    return (
      <Container className="items-center gap-2">
        <Loader2 className="size-8 animate-spin text-background" />
        <Typography as="small" size="sm" className="text-background">
          {generatingLabel}
        </Typography>
      </Container>
    );
  }

  if (isExpired) {
    const blurredQr = (
      <>
        <Image
          src="/images/qr-blurred.png"
          alt=""
          width={size}
          height={size}
          className={cn('rounded-md', HOVER_OPACITY)}
        />
        <span className="absolute top-1/2 right-0 -translate-y-1/2 bg-card py-2 pr-4 pl-7 text-sm font-bold whitespace-nowrap text-foreground [clip-path:polygon(0%_0%,100%_0%,100%_100%,16px_100%)]">
          {clickToReloadLabel}
        </span>
      </>
    );

    if (expiredReloadAction) {
      return (
        <button
          type="button"
          onClick={expiredReloadAction.onClick}
          aria-label={expiredReloadAction.ariaLabel}
          className="group absolute inset-0 flex cursor-pointer items-center justify-center p-4"
        >
          {blurredQr}
        </button>
      );
    }

    return blurredQr;
  }

  return (
    <>
      <QRCodeSVG value={url} size={size} className={cn(activeQrHasHoverEffect && HOVER_OPACITY)} />
      <Image
        src="/images/ring-logo.svg"
        alt="Pubky Ring"
        width={ringLogoSize}
        height={ringLogoSize}
        className={cn(
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
          activeQrHasHoverEffect && HOVER_OPACITY,
        )}
      />
    </>
  );
}
