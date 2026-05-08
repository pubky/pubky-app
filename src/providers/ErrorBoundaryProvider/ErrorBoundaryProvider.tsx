'use client';

import { ErrorBoundary } from 'react-error-boundary';
import type { ErrorBoundaryProviderProps } from './ErrorBoundaryProvider.types';
import { ErrorFallback } from './ErrorFallback';

/**
 * ErrorBoundaryProvider
 *
 * Root-level error boundary that catches unhandled errors during React render.
 * Displays a fallback UI with the error message.
 */
export function ErrorBoundaryProvider({ children }: ErrorBoundaryProviderProps) {
  return <ErrorBoundary FallbackComponent={ErrorFallback}>{children}</ErrorBoundary>;
}
