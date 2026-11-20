import { walletNetwork } from '@/libs/wallet/networks';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    {
      walletNetwork: walletNetwork(process.env.WALLET_NETWORK),
      locksNetwork: walletNetwork(process.env.WALLET_LOCKS_NETWORK),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
