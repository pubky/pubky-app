import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RootContainer } from './ContainerRoot';

// next/font/google resolves through the Next build pipeline, which is not running in tests.
vi.mock('next/font/google', () => ({
  Inter_Tight: () => ({ variable: '--font-geist-sans' }),
}));

// Distinct origins per field: the test config points the CDN and the API at the same host,
// which would let a component that read the wrong getter (or only one of them) pass.
vi.mock('@/libs/runtime-config/runtime-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/libs/runtime-config/runtime-config')>()),
  getCdnUrl: () => 'https://cdn.example.com/static',
  getNexusUrl: () => 'https://api.example.com',
}));

describe('RootContainer', () => {
  it('preconnects to the CDN origin and the Nexus API origin', () => {
    render(
      <RootContainer>
        <div data-testid="child" />
      </RootContainer>,
    );

    // Images come from the CDN and are fetched in no-cors mode; the Nexus API is a CORS
    // request, which cannot reuse a non-credentialed preconnected socket. Hence two hints,
    // and hence the anonymous one for the API origin.
    const hints = Array.from(document.querySelectorAll('link[rel="preconnect"]')).map((hint) => [
      hint.getAttribute('href'),
      hint.getAttribute('crossorigin'),
    ]);

    expect(hints).toEqual([
      ['https://cdn.example.com', null],
      ['https://api.example.com', 'anonymous'],
    ]);
  });

  it('keeps the raw runtime-config script first in <body>', () => {
    render(
      <RootContainer>
        <div data-testid="child" />
      </RootContainer>,
    );

    // The preconnect hints are host-hoistable and land in <head>; the inline config script
    // must stay the first element of <body> so it executes during parsing, before any bundle.
    const script = document.getElementById('pubky-runtime-config');

    expect(script).not.toBeNull();
    // Nothing renders before it inside its container (RTL's own wrapper means the element
    // below `document.body` is a div here, so sibling order is the portable assertion; the
    // served HTML is what proves `<body>` starts with the script).
    expect(script?.parentElement?.firstElementChild).toBe(script);
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
