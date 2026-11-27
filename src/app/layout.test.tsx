import { renderToString } from 'react-dom/server';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({ connection: vi.fn(async () => {}) }));
vi.mock('@/molecules/ContainerRoot/ContainerRoot', () => ({
  RootContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/molecules/StructuredData/StructuredData', () => ({ StructuredData: () => null }));
vi.mock('@/organisms/PulseConsent/PulseConsent', () => ({ PulseConsentBanner: () => null }));
vi.mock('@/molecules/Toaster/Toaster', () => ({ Toaster: () => null }));
vi.mock('@/organisms/PwaManager/PwaManager', () => ({ PwaManager: () => null }));
vi.mock('@/providers/ServiceWorkerRegistrationProvider/ServiceWorkerRegistrationProvider', () => ({
  ServiceWorkerRegistrationProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/providers/GlobalErrorHandlerProvider/GlobalErrorHandlerProvider', () => ({
  GlobalErrorHandlerProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/providers/ErrorBoundaryProvider/ErrorBoundaryProvider', () => ({
  ErrorBoundaryProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/organisms/AppShell/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

// React marks a Suspense boundary in server HTML with <!--$--> ... <!--/$-->.
async function renderLayout(): Promise<string> {
  const { default: RootLayout } = await import('./layout');
  return renderToString(await RootLayout({ children: 'page' }));
}

describe('RootLayout', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('renders the app shell outside any Suspense boundary in a server build', async () => {
    const html = await renderLayout();
    expect(html).toContain('<main>page</main>');
    expect(html).not.toContain('<!--$-->');
  });

  it('wraps the app shell in a Suspense boundary in the static export, whose pages are prerendered', async () => {
    vi.stubEnv('NEXT_PUBLIC_STATIC_EXPORT', 'true');
    const html = await renderLayout();
    expect(html).toContain('<!--$--><main>page</main><!--/$-->');
  });
});
