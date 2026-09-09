import { Metadata } from '@/molecules/Metadata/Metadata';

export const metadata = Metadata({
  title: 'Offline - Pubky App',
  description: 'You are currently offline.',
  robots: false,
});

export default function Offline() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-2xl font-bold">You&apos;re offline</h2>
      <p className="text-muted-foreground">Please check your internet connection and try again.</p>
    </div>
  );
}
