import { Metadata } from '@/molecules/Metadata/Metadata';
import { PassportReturn } from '@/templates/Auth/PassportReturn/PassportReturn';

export const metadata = Metadata({
  title: 'Returning from Passport',
  description: 'Returning to Pubky after signing in with Pubky Passport.',
});

export default function PassportReturnPage() {
  return <PassportReturn />;
}
