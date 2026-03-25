'use client';

import type { ReactNode } from 'react';

import * as Atoms from '@/atoms';

const DEFAULT_DELAY_MS = 400;

interface TooltipProviderProps {
  children: ReactNode;
}

/**
 * Single app-wide Radix Tooltip provider (delay / skip-delay). Required for any
 * `Tooltip` usage; wrap once inside IntlProvider.
 */
export function TooltipProvider({ children }: TooltipProviderProps) {
  return <Atoms.TooltipProvider delayDuration={DEFAULT_DELAY_MS}>{children}</Atoms.TooltipProvider>;
}
