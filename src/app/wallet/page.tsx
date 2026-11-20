import { Wallet } from '@/templates/Wallet/Wallet';

type WalletPageProps = {
  searchParams: Promise<{ recipient?: string | string[] }>;
};

export default async function WalletPage({ searchParams }: WalletPageProps) {
  const { recipient } = await searchParams;
  return <Wallet recipient={typeof recipient === 'string' ? recipient : undefined} />;
}
