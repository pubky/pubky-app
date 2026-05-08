import { Metadata } from '@/molecules/Metadata/Metadata';

export const metadata = Metadata({
  title: 'Page Not Found - Pubky App',
  description: 'The page you are looking for does not exist.',
  robots: false,
});

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <h2 className="text-2xl font-bold">Not Found</h2>
      <p>Could not find requested resource</p>
    </div>
  );
}
