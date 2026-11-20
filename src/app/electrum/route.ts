import { upgradeRelay } from '../../../scripts/wallet/hosted-relay.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export function GET(request: Request) {
  return upgradeRelay(request, 'electrum');
}
