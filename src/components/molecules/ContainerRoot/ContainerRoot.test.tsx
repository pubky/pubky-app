import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RootContainer } from './ContainerRoot';

// next/font/google resolves through the Next build pipeline, which is not running in tests.
vi.mock('next/font/google', () => ({
  Inter_Tight: () => ({ variable: '--font-geist-sans' }),
}));

describe('RootContainer', () => {
  it('preconnects to the CDN and the Nexus API before the first image and data fetch', () => {
    render(
      <RootContainer>
        <div data-testid="child" />
      </RootContainer>,
    );

    // Two hints for the same origin on production (both PUBKY_RUNTIME_* URLs point at
    // nexus.pubky.app): images are fetched in no-cors mode, the Nexus API in cors mode,
    // and a CORS request cannot reuse a non-credentialed preconnected socket.
    const hints = Array.from(document.querySelectorAll('link[rel="preconnect"]')).map((hint) => [
      hint.getAttribute('href'),
      hint.getAttribute('crossorigin'),
    ]);

    expect(hints).toEqual([
      ['https://nexus.staging.pubky.app', null],
      ['https://nexus.staging.pubky.app', 'anonymous'],
    ]);
  });

  it('still renders its children', () => {
    render(
      <RootContainer>
        <div data-testid="child" />
      </RootContainer>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
