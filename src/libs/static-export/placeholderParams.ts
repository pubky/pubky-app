import { Env } from '@/libs/env/env';

/** The one value each dynamic segment is exported under; the offline bundle's launcher serves that page for every real value. */
export const STATIC_EXPORT_PLACEHOLDER = '_';

/**
 * The `generateStaticParams` export of a dynamic route: one placeholder page in the static export,
 * and no function at all in a server build. Next treats a route that has the function as statically
 * generated on demand for unlisted params, even when it returns `[]`, and the root layout's
 * `connection()` then fails every request with `DYNAMIC_SERVER_USAGE`; without it the route renders
 * per request as before. Pages read the real values from the URL path (`usePathname` and the
 * matchers in `@/app/routes`), never from `params` or `useParams`, which report the placeholder in
 * the export.
 */
export function placeholderParams<Key extends string>(...keys: Key[]): (() => Record<Key, string>[]) | undefined {
  if (!Env.NEXT_PUBLIC_STATIC_EXPORT) return undefined;
  const params = Object.fromEntries(keys.map((key) => [key, STATIC_EXPORT_PLACEHOLDER])) as Record<Key, string>;
  return () => [params];
}
