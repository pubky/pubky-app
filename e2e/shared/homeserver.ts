// Stack addresses shared by Cypress (`cypress.config.ts`) and Playwright. The admin URL and
// password are test-stack credentials, not app configuration. `PUBKY_RUNTIME_*` values are read
// from the object the caller passes in, so this module does not touch `process.env` itself.

export type E2eStackConfig = {
  homeserverAdminUrl: string;
  homeserverAdminPassword: string;
  homeserverPublicKey: string;
  nexusUrl: string;
};

// The same defaults Cypress used before this helper existed. The pubky-testnet homeserver key is
// the one the app's testnet mode also defaults to.
export const E2E_STACK_DEFAULTS: E2eStackConfig = {
  homeserverAdminUrl: 'http://localhost:6288/generate_signup_token',
  homeserverAdminPassword: 'admin',
  nexusUrl: 'http://localhost:8080',
  homeserverPublicKey: '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo',
};

export const e2eStackConfigFromEnv = (env: Record<string, string | undefined>): E2eStackConfig => ({
  homeserverAdminUrl: env['HOMESERVER_ADMIN_URL'] || E2E_STACK_DEFAULTS.homeserverAdminUrl,
  homeserverAdminPassword: env['HOMESERVER_ADMIN_PASSWORD'] || E2E_STACK_DEFAULTS.homeserverAdminPassword,
  nexusUrl: env['PUBKY_RUNTIME_NEXUS_URL'] || E2E_STACK_DEFAULTS.nexusUrl,
  homeserverPublicKey: env['PUBKY_RUNTIME_HOMESERVER'] || E2E_STACK_DEFAULTS.homeserverPublicKey,
});

/** Asks the test homeserver's admin endpoint for a single-use signup token. */
export const fetchSignupToken = async (adminUrl: string, adminPassword: string): Promise<string> => {
  const response = await fetch(adminUrl, {
    headers: { 'X-Admin-Password': adminPassword },
  });
  if (!response.ok) {
    throw new Error(`signup token request to ${adminUrl} answered ${response.status}`);
  }
  return (await response.text()).trim();
};
