import { APP_ROUTES } from '@/app/routes';

// Only the mounted Shop bridge reads this registry. Tokens let overlapping host
// navigations settle independently without releasing a newer navigation's guard.
const pending = new Set<symbol>();

export function beginShopHostNavigation(): (() => void) | null {
  if (
    typeof window === 'undefined' ||
    (window.location.pathname !== APP_ROUTES.SHOP && !window.location.pathname.startsWith(`${APP_ROUTES.SHOP}/`))
  )
    return null;
  const token = Symbol();
  pending.add(token);
  return () => {
    pending.delete(token);
  };
}

export function isShopHostNavigationPending(): boolean {
  return pending.size > 0;
}

export function clearShopHostNavigation(): void {
  pending.clear();
}
