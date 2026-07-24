import type { ComponentProps, ReactNode } from 'react';
import { Card } from '@/atoms/Card/Card';
import { cn } from '@/libs/utils/utils';

interface BalancedQrCardProps extends Omit<ComponentProps<typeof Card>, 'children'> {
  children: ReactNode;
  illustration: ReactNode;
}

/**
 * Keeps a QR code centered in the card by balancing the illustration with an
 * equal-width spacer at desktop sizes.
 */
export function BalancedQrCard({ children, illustration, className, ...props }: BalancedQrCardProps) {
  return (
    <Card
      className={cn(
        'w-full flex-row items-center justify-center gap-12 overflow-hidden rounded-md p-6 lg:p-12',
        className,
      )}
      {...props}
    >
      <div data-slot="balanced-qr-illustration" className="hidden w-48 shrink-0 lg:block">
        {illustration}
      </div>
      <div data-slot="balanced-qr-content" className="flex w-48 shrink-0 items-center justify-center">
        {children}
      </div>
      <div data-slot="balanced-qr-spacer" className="hidden w-48 shrink-0 lg:block" aria-hidden="true" />
    </Card>
  );
}
