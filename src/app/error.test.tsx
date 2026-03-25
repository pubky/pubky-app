import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ErrorPage from './error';
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

describe('app/error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders error message and retry button', () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error('Boom')} reset={reset} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('calls reset when retry is clicked', () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error('Boom')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('logs the boundary error once', () => {
    const reset = vi.fn();
    const error = new Error('Boom');
    render(<ErrorPage error={error} reset={reset} />);

    expect(Logger.error).toHaveBeenCalledWith('[app/error] Route segment render error', error);
  });
});
