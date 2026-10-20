import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readServerConfig,
  resetRuntimeConfigForTests,
  RUNTIME_CONFIG_WINDOW_KEY,
} from '@/libs/runtime-config/runtime-config';
import {
  NETWORK_RUNTIME_DEFAULTS,
  type NetworkRuntimeConfig,
  PUBKY_RUNTIME_ENV_NAMES,
} from '@/libs/runtime-config/runtime-config.schema';
import ShopLayout from './layout';

// ShopEmbed owns the frame lifecycle; this suite covers the production route boundary.
vi.mock('@/organisms/ShopEmbed/ShopEmbed', () => ({ ShopEmbed: () => <iframe title="Pubky Shop" /> }));
// Independent feed/profile queries are covered by ContentLayout's tests.
vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

function configureProduction() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VITEST', '');
  for (const [key, value] of Object.entries(NETWORK_RUNTIME_DEFAULTS)) {
    vi.stubEnv(
      PUBKY_RUNTIME_ENV_NAMES[key as keyof NetworkRuntimeConfig],
      Array.isArray(value) ? JSON.stringify(value) : String(value),
    );
  }
  vi.stubEnv('PUBKY_RUNTIME_ENV', 'production');
  // A deployment need not opt into Shop: omitting the old flag must still render the iframe.
  vi.stubEnv('PUBKY_RUNTIME_SHOP_EMBED_ENABLED', undefined);
  window[RUNTIME_CONFIG_WINDOW_KEY] = readServerConfig();
  resetRuntimeConfigForTests();
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete window[RUNTIME_CONFIG_WINDOW_KEY];
  resetRuntimeConfigForTests();
  window.history.replaceState(null, '', '/');
});

describe('ShopLayout', () => {
  it.each(['/shop', '/shop/marketplace/listing/abc?checkout=1#payment'])(
    'renders embedded Shop at %s in the default production configuration',
    (path) => {
      window.history.replaceState(null, '', path);
      configureProduction();
      render(
        <ShopLayout>
          <div>Shop route</div>
        </ShopLayout>,
      );
      expect(screen.getByTitle('Pubky Shop')).toBeInTheDocument();
      expect(screen.getByText('Shop route')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Shop unavailable' })).not.toBeInTheDocument();
      expect(window.location.pathname + window.location.search + window.location.hash).toBe(path);
    },
  );
});
