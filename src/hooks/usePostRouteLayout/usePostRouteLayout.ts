'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { POST_LAYOUT_QUERY_PARAM } from '@/config/posts';
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT, type LayoutType } from '@/stores/home/home.types';

const POST_ROUTE_LAYOUTS: LayoutType[] = [LAYOUT.COLUMNS, LAYOUT.WIDE, LAYOUT.LIST];

interface PostRouteLayout {
  layout: LayoutType;
  setLayout: (layout: LayoutType) => void;
}

function getPostRouteLayout(value: string | null): LayoutType | undefined {
  return POST_ROUTE_LAYOUTS.find((layout) => layout === value);
}

/**
 * Resolves the post layout through one interface. A valid route layout keeps
 * changes temporary in the current URL; otherwise changes use the home store.
 */
export function usePostRouteLayout(): PostRouteLayout {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const homeLayout = useHomeStore((state) => state.layout);
  const setHomeLayout = useHomeStore((state) => state.setLayout);
  const routeLayout = getPostRouteLayout(searchParams.get(POST_LAYOUT_QUERY_PARAM));

  const setLayout = (layout: LayoutType) => {
    if (!routeLayout) {
      setHomeLayout(layout);
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set(POST_LAYOUT_QUERY_PARAM, layout);
    router.replace(`${pathname}?${nextSearchParams.toString()}`);
  };

  return {
    layout: routeLayout ?? homeLayout,
    setLayout,
  };
}
