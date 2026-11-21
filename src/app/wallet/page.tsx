import { Wallet } from '@/templates/Wallet/Wallet';

type WalletPageProps = {
  searchParams: Promise<{ recipient?: string | string[]; timing?: string | string[] }>;
};

export default async function WalletPage({ searchParams }: WalletPageProps) {
  const { recipient, timing } = await searchParams;
  return <Wallet recipient={typeof recipient === 'string' ? recipient : undefined} showTimings={timing === '1'} />;
}
