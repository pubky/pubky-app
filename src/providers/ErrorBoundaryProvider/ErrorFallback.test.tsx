import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import { ErrorFallback } from './ErrorFallback';

describe('ErrorFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
  });

  it('renders error message and retry button', () => {
    const resetErrorBoundary = vi.fn();
    render(<ErrorFallback error={new Error('Render failed')} resetErrorBoundary={resetErrorBoundary} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Render failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('resets boundary when retry is clicked', () => {
    const resetErrorBoundary = vi.fn();
    render(<ErrorFallback error={new Error('Render failed')} resetErrorBoundary={resetErrorBoundary} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(resetErrorBoundary).toHaveBeenCalledTimes(1);
  });

  it('logs caught boundary errors', () => {
    const error = new Error('Render failed');
    const resetErrorBoundary = vi.fn();
    render(<ErrorFallback error={error} resetErrorBoundary={resetErrorBoundary} />);

    expect(Logger.error).toHaveBeenCalledWith('[ErrorBoundaryProvider] Caught render error', error);
  });
});
