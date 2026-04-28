import * as App from '@/app';
import { AuthStatus, type RouteAccessMap } from '@/hooks/useAuthStatus/useAuthStatus.types';

// Define which routes each authentication status can access
export const ROUTE_ACCESS_MAP: RouteAccessMap = {
  [AuthStatus.UNAUTHENTICATED]: App.UNAUTHENTICATED_ROUTES,
  [AuthStatus.AUTHENTICATED]: App.AUTHENTICATED_ROUTES,
  [AuthStatus.NEEDS_PROFILE_CREATION]: App.NEEDS_PROFILE_CREATION_ROUTES,
};
