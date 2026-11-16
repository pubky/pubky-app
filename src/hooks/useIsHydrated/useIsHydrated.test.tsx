import { renderToString } from 'react-dom/server';
import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useIsHydrated } from './useIsHydrated';

function HydrationProbe() {
  return <span data-testid="probe">{useIsHydrated() ? 'hydrated' : 'server'}</span>;
}

describe('useIsHydrated', () => {
  it('is false on the server', () => {
    expect(renderToString(<HydrationProbe />)).toContain('server');
  });

  it('is true on a client-only mount', () => {
    const { result } = renderHook(() => useIsHydrated());
    expect(result.current).toBe(true);
  });

  it('hydrates the server markup without a mismatch, then turns true', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onRecoverableError = vi.fn();
    const container = document.createElement('div');
    container.innerHTML = renderToString(<HydrationProbe />);
    document.body.appendChild(container);

    await act(async () => {
      render(<HydrationProbe />, { container, hydrate: true, onRecoverableError });
    });

    expect(screen.getByTestId('probe')).toHaveTextContent('hydrated');
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    container.remove();
  });
});
