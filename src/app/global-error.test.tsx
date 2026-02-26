import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GlobalErrorPage from './global-error';
import { Logger } from '@/libs';

vi.mock('@/libs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs')>();
  return {
    ...actual,
    Logger: {
      ...actual.Logger,
      error: vi.fn(),
    },
  };
});

describe('app/global-error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders global error fallback', () => {
    const reset = vi.fn();
    render(<GlobalErrorPage error={new Error('Root crash')} reset={reset} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Root crash')).toBeInTheDocument();
  });

  it('calls reset when retry is clicked', () => {
    const reset = vi.fn();
    render(<GlobalErrorPage error={new Error('Root crash')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('logs root boundary errors', () => {
    const reset = vi.fn();
    const error = new Error('Root crash');
    render(<GlobalErrorPage error={error} reset={reset} />);

    expect(Logger.error).toHaveBeenCalledWith('[app/global-error] Root render error', error);
  });
});
