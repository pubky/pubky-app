import { placeholderParams } from '@/libs/static-export/placeholderParams';
import { Custom } from '@/templates/Feed/Custom/Custom';

export function generateStaticParams() {
  return placeholderParams('id');
}

// A server component of its own: Next ignores `generateStaticParams` beside a client default export.
export default function CustomFeedPage() {
  return <Custom />;
}
