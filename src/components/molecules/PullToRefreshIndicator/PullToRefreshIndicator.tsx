'use client';

import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Typography } from '@/atoms/Typography/Typography';

import type { PullToRefreshIndicatorProps } from './PullToRefreshIndicator.types';

/**
 * PullToRefreshIndicator
 *
 * A pill-shaped indicator that appears when the user pulls down to refresh.
 * Shows different states: pulling (arrow down), ready (arrow up), refreshing (spinner).
 *
 * Uses absolute positioning so it doesn't affect layout when hidden.
 * Visibility is derived from state - only hidden when idle.
 *
 * @example
 * ```tsx
 * <PullToRefreshIndicator
 *   state="pulling"
 *   pullDistance={50}
 * />
 * ```
 */
import { ChevronDown } from 'lucide-react';
import { cn } from '@/libs/utils/utils';
export function PullToRefreshIndicator({ state, pullDistance }: PullToRefreshIndicatorProps) {
  const t = useTranslations('pullToRefresh');
  const isReady = state === 'ready';
  const isRefreshing = state === 'refreshing';
  const isVisible = state !== 'idle';

  // Don't render anything if not visible
  if (!isVisible) {
    return null;
  }

  // Determine label text based on state
  const labelText = isRefreshing ? t('refreshing') : isReady ? t('releaseToRefresh') : t('pullToRefresh');
  return (
    <Container
      overrideDefaults
      className={cn(
        'pointer-events-none absolute right-0 left-0 z-50 flex justify-center',
        isRefreshing && 'transition-[top] duration-200 ease-out',
      )}
      // `top` must be in style because it's a dynamic pixel value calculated from pullDistance
      style={{
        top: `${Math.max(pullDistance - 48, -48)}px`,
      }}
      data-testid="pull-to-refresh-indicator"
      aria-hidden={!isVisible}
    >
      <Container
        overrideDefaults
        className="inline-flex items-center gap-2.5 rounded-full border border-brand/35 bg-background/75 px-3.5 py-2.5 text-sm text-brand shadow-lg backdrop-blur-md"
        data-testid="pull-to-refresh-pill"
      >
        {/* Arrow icon - visible when not refreshing */}
        {!isRefreshing && (
          <ChevronDown
            className={cn('size-4 transition-transform duration-150', isReady && 'rotate-180')}
            data-testid="pull-to-refresh-arrow"
          />
        )}

        {/* Spinner - visible when refreshing */}
        {isRefreshing && <Spinner size="sm" data-testid="pull-to-refresh-spinner" />}

        {/* Label text */}
        <Typography
          as="span"
          size="sm"
          overrideDefaults
          className="font-medium text-brand"
          data-testid="pull-to-refresh-label"
        >
          {labelText}
        </Typography>
      </Container>
    </Container>
  );
}
