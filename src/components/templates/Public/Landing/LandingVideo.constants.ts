import { BREAKPOINTS } from '@/config/theme';

export const LANDING_DESKTOP_QUERY = `(min-width: ${BREAKPOINTS.md}px)`;
export const LANDING_VIDEO_QUERY = `${LANDING_DESKTOP_QUERY} and (prefers-reduced-motion: no-preference)`;
