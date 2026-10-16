import { ShopMetadataController } from '@/controllers/shop-metadata/shop-metadata';
import { Metadata } from '@/molecules/Metadata/Metadata';

export async function generateMetadata({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const preview = await ShopMetadataController.fetch(path);
  const { title, description, openGraph, twitter, alternates } = Metadata({
    ...preview,
    siteName: 'Pubky Marketplace',
  });
  return { title, description, openGraph, twitter, alternates };
}

/** The persistent /shop layout owns the frame and keeps its session lifecycle mounted. */
export default function ShopPage() {
  return null;
}
