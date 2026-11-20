import { getResourceRoute, RESOURCE_ROUTES } from '@/app/routes';
import { Metadata } from '@/molecules/Metadata/Metadata';
import { ResourcePage } from '@/templates/Resource/ResourcePage';

export interface ResourceRoutePageProps {
  searchParams: Promise<{ uri?: string | string[] }>;
}

/** The link in `?uri=` (the first when repeated), or `null` without one. */
async function readUri(searchParams: ResourceRoutePageProps['searchParams']): Promise<string | null> {
  const { uri } = await searchParams;
  const value = Array.isArray(uri) ? uri[0] : uri;
  return value?.trim() || null;
}

export async function generateMetadata({ searchParams }: ResourceRoutePageProps) {
  const uri = await readUri(searchParams);
  return Metadata({
    title: 'External resource - Pubky App',
    description: 'A link shared on Pubky: where else it is, and what the people who tagged it also tagged.',
    url: uri ? getResourceRoute(uri) : RESOURCE_ROUTES.RESOURCE,
    // The page takes any link and its content comes from Pinakes in the browser: not for search engines.
    robots: false,
  });
}

/** Public: reachable signed out (`isDynamicPublicRoute`), the link in `?uri=`. */
export default async function ResourceRoutePage({ searchParams }: ResourceRoutePageProps) {
  return <ResourcePage uri={await readUri(searchParams)} />;
}
