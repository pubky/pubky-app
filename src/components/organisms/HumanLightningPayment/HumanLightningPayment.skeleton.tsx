import React from 'react';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

/**
 * Skeleton for QR code while loading invoice.
 * Matches the size of the actual QR code container (192x192).
 */
export function QRCodeSkeleton() {
  return <Skeleton className="h-[192px] w-[192px] rounded-[9px]" />;
}

/**
 * Skeleton for price section while loading invoice.
 * Heights match the actual content to avoid layout shift.
 */
export function PriceSkeleton() {
  return (
    <React.Fragment>
      {/* Price skeleton - matches "₿ 10" with text-5xl/text-6xl leading-none */}
      <Skeleton className="h-[48px] w-28 rounded lg:h-[60px]" />
      {/* Description skeleton - matches "Pay ₿ 10 (approximately $0.01) to continue." */}
      <Skeleton className="h-6 w-64 rounded" />
    </React.Fragment>
  );
}
