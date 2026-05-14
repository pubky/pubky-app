import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GlobalErrorPage from './global-error';

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
});
