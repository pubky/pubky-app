import { Metadata } from '@/molecules/Metadata/Metadata';
import { TagsOfInterest } from '@/templates/Onboarding/TagsOfInterest/TagsOfInterest';

export const metadata = Metadata({
  title: 'Tags of Interest - Onboarding',
  description: 'Onboarding tags of interest page on pubky app.',
});

export default function TagsPage() {
  return <TagsOfInterest />;
}
