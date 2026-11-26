import { NextResponse } from 'next/server';
import { handleApiError } from '@/libs/api/route-error-handler';

/**
 * DEV/TEST ONLY: Generates a signup token from the homeserver admin endpoint.
 *
 * This API route is only available in non-production environments or when
 * running Cypress E2E tests. It keeps admin credentials server-side only,
 * preventing them from being exposed in the client bundle.
 *
 * @security This endpoint should NEVER be used in production.
 * The HOMESERVER_ADMIN_URL and HOMESERVER_ADMIN_PASSWORD env vars
 * are server-side only (no NEXT_PUBLIC_ prefix).
 */
export async function GET() {
  const isProduction = process.env.NODE_ENV === 'production';
  const isCypressTest = process.env.CYPRESS === 'true';

  // Only allow in development or Cypress E2E tests
  if (isProduction && !isCypressTest) {
    return NextResponse.json(
      { error: 'This endpoint is only available in non-production environments.' },
      { status: 403 },
    );
  }

  // Read directly from process.env to avoid circular dependency with @/libs
  const endpoint = process.env.HOMESERVER_ADMIN_URL;
  const password = process.env.HOMESERVER_ADMIN_PASSWORD;

  if (!endpoint || !password) {
    return NextResponse.json(
      { error: 'Homeserver admin credentials not configured. Set HOMESERVER_ADMIN_URL and HOMESERVER_ADMIN_PASSWORD.' },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'X-Admin-Password': password,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Failed to generate signup token: ${response.status} ${errorText}` },
        { status: response.status },
      );
    }

    const token = (await response.text()).trim();

    if (!token) {
      return NextResponse.json({ error: 'No token received from server' }, { status: 500 });
    }

    return NextResponse.json({ token });
  } catch (error) {
    return handleApiError(error, 'api.dev.signup-token.GET', {
      unknownErrorMessage: `Failed to connect to homeserver admin: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
