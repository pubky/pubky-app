import { Env } from '@/libs/env/env';

/** The one value each dynamic segment is exported under; the offline bundle's launcher serves that page for every real value. */
export const STATIC_EXPORT_PLACEHOLDER = '_';

/**
 * `generateStaticParams` of a dynamic route: one placeholder page in the static export, none in a
 * server build, which renders every request. Pages read the real values from the URL path
 * (`usePathname` and the matchers in `@/app/routes`), never from `params` or `useParams`, which
 * report the placeholder in the export.
 */
export function placeholderParams<Key extends string>(...keys: Key[]): Record<Key, string>[] {
  if (!Env.NEXT_PUBLIC_STATIC_EXPORT) return [];
  return [Object.fromEntries(keys.map((key) => [key, STATIC_EXPORT_PLACEHOLDER])) as Record<Key, string>];
}
