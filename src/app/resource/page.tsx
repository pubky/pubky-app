import { redirect, RedirectType } from 'next/navigation';
import { getPubkyAppPageRoute, getResourceRoute, RESOURCE_ROUTES } from '@/app/routes';
import { getPubkyAppTarget } from '@/libs/pubkyApp/pubkyAppTarget';
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
  // A pubky.app file is shown as a file, no external resource.
  const isFile = uri !== null && getPubkyAppTarget(uri)?.kind === 'file';
  return Metadata({
    title: isFile ? 'File - Pubky App' : 'External resource - Pubky App',
    description: 'A link shared on Pubky: where else it is, and what the people who tagged it also tagged.',
    url: uri ? getResourceRoute(uri) : RESOURCE_ROUTES.RESOURCE,
    // The page takes any link and its content comes from Pinakes in the browser: not for search engines.
    robots: false,
  });
}

/**
 * Public: reachable signed out (`isDynamicPublicRoute`), the link in `?uri=`. A pubky.app post or
 * profile has its own page: a link to it as a resource lands there, in place of this page in the
 * history (`getPubkyAppPageRoute`).
 */
export default async function ResourceRoutePage({ searchParams }: ResourceRoutePageProps) {
  const uri = await readUri(searchParams);
  const ownPage = uri ? getPubkyAppPageRoute(uri) : null;
  if (ownPage) redirect(ownPage, RedirectType.replace);
  return <ResourcePage uri={uri} />;
}
