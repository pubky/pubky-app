import { Env } from '@/libs/env/env';
import { getDefaultUrl, getEmail } from '@/libs/runtime-config/runtime-config';

/**
 * Whether the app is served by its own Next.js server. The static export (the offline bundle) is
 * not: it has no route handler under `/api`, no Shop proxy, and its origin (`http://127.0.0.1:<port>`)
 * opens on one computer only. Features that need one of those are hidden, or fall back to email.
 */
export const HAS_APP_SERVER = !Env.NEXT_PUBLIC_STATIC_EXPORT;

/** The origin a shared link points at: this app's own, or the public web app when this origin is private. */
export function getShareOrigin(): string {
  if (!HAS_APP_SERVER) return getDefaultUrl().replace(/\/$/, '');
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/** A post report by email to the support address, for a build that cannot send one to the app server. */
export function getReportMailto(postUrl: string): string {
  return `mailto:${getEmail()}?subject=${encodeURIComponent('Report post')}&body=${encodeURIComponent(postUrl)}`;
}
