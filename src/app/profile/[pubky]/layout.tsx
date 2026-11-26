import { placeholderParams } from '@/libs/static-export/placeholderParams';
import { DynamicProfileLayout } from './DynamicProfileLayout';

/** Covers every page under the route: the static export needs one placeholder profile. */
export function generateStaticParams() {
  return placeholderParams('pubky');
}

// A server component of its own: Next ignores `generateStaticParams` beside a client default export.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <DynamicProfileLayout>{children}</DynamicProfileLayout>;
}
