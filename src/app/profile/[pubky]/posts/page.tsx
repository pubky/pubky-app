import { redirect } from 'next/navigation';

interface DynamicProfilePostsPageProps {
  params: Promise<{
    pubky: string;
  }>;
}

export default async function DynamicProfilePostsPage({ params }: DynamicProfilePostsPageProps) {
  const { pubky } = await params;

  redirect(`/profile/${pubky}`);
}
