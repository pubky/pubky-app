import { AUTHENTICATED_ROUTES, NEEDS_PROFILE_CREATION_ROUTES, UNAUTHENTICATED_ROUTES } from '@/app/routes';
import { AuthStatus, type RouteAccessMap } from '@/hooks/useAuthStatus/useAuthStatus.types';

// Define which routes each authentication status can access
export const ROUTE_ACCESS_MAP: RouteAccessMap = {
  [AuthStatus.UNAUTHENTICATED]: UNAUTHENTICATED_ROUTES,
  [AuthStatus.AUTHENTICATED]: AUTHENTICATED_ROUTES,
  [AuthStatus.NEEDS_PROFILE_CREATION]: NEEDS_PROFILE_CREATION_ROUTES,
};
