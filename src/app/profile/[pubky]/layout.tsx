import { placeholderParams } from '@/libs/static-export/placeholderParams';
import { DynamicProfileLayout } from './DynamicProfileLayout';

/** Covers every page under the route: the static export needs one placeholder profile. */
export function generateStaticParams() {
  return placeholderParams('pubky');
}

export default DynamicProfileLayout;
