'use client';

import { Logger } from '@/libs/logger/logger';
import { QrCodeSlot } from '@/molecules/QrCodeSlot/QrCodeSlot';
import { toast } from '@/molecules/Toaster/toast';
import type { AuthQrCopyButtonProps } from './AuthQrCopyButton.types';

/** The Pubky Ring auth QR: a click copies its `pubkyauth://` link, or reloads it once expired. */
export function AuthQrCopyButton({
  url,
  isLoading,
  isExpired,
  onCopy,
  onReload,
  reloadAriaLabel,
  disabled = false,
}: AuthQrCopyButtonProps) {
  const handleCopy = async () => {
    if (!url) return;
    try {
      await onCopy();
      toast({
        variant: 'info',
        title: 'Authentication link copied',
      });
    } catch (error) {
      Logger.error('Failed to copy auth URL to clipboard:', error);
      toast({
        variant: 'error',
        description: 'Could not copy to clipboard',
      });
    }
  };

  return (
    <button
      type="button"
      className="group relative flex size-48 cursor-pointer items-center justify-center rounded-md bg-white p-2"
      onClick={isExpired ? onReload : handleCopy}
      disabled={disabled || isLoading || (!url && !isExpired)}
      aria-label={isExpired ? reloadAriaLabel : 'Copy authentication link'}
    >
      <QrCodeSlot
        isLoading={isLoading}
        isExpired={isExpired}
        url={url}
        generatingLabel={'Generating QR Code...'}
        clickToReloadLabel={'Click to reload'}
        activeQrHasHoverEffect
      />
    </button>
  );
}
