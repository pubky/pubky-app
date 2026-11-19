export enum AuthStatus {
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  AUTHENTICATED = 'AUTHENTICATED',
  NEEDS_PROFILE_CREATION = 'NEEDS_PROFILE_CREATION',
  /** The account is held behind the social v1 migration gate (`/migration`, ADR-0026). */
  NEEDS_SOCIAL_MIGRATION = 'NEEDS_SOCIAL_MIGRATION',
}

export interface AuthStatusResult {
  status: AuthStatus;
  isLoading: boolean;
  hasKeypair: boolean;
  hasProfile: boolean | null;
  isFullyAuthenticated: boolean;
}

export interface RouteAccess {
  allowedRoutes: string[];
  redirectTo?: string;
}

export type RouteAccessMap = Record<AuthStatus, RouteAccess>;
