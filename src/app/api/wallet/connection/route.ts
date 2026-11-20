import { issueTicket } from '../../../../../scripts/wallet/tickets.mjs';
import { connectionGrant, connectionSettings } from '../../../../../scripts/wallet/transport.mjs';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'iad1';

/** Issue a short-lived transport grant for the fixed operator endpoints. */
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return Response.json({ error: 'Open the wallet in Pubky.' }, { status: 403, headers });
  }
  try {
    const settings = connectionSettings(process.env);
    if (process.env.VERCEL === '1') {
      const origin = request.headers.get('origin');
      if (new URL(request.url).origin !== settings.appOrigin || (origin && origin !== settings.appOrigin)) {
        return Response.json({ error: 'Open the wallet in Pubky.' }, { status: 403, headers });
      }
      return Response.json(await issueTicket(settings), { headers });
    }
    return Response.json(connectionGrant(settings), { headers });
  } catch {
    return Response.json({ error: 'The wallet relay has not been configured.' }, { status: 503, headers });
  }
}
