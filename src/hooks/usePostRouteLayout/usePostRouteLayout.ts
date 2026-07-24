'use client';

import { useSearchParams } from 'next/navigation';
import { POST_LAYOUT_QUERY_PARAM } from '@/config/posts';
import { LAYOUT, type LayoutType } from '@/stores/home/home.types';

/**
 * Returns the supported temporary layout override carried by a post URL.
 * Other values deliberately fall back to the persisted home preference.
 */
export function usePostRouteLayout(): LayoutType | undefined {
  const searchParams = useSearchParams();

  return searchParams.get(POST_LAYOUT_QUERY_PARAM) === LAYOUT.LIST ? LAYOUT.LIST : undefined;
}
