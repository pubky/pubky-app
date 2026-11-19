/**
 * vibes.pubky.app opens this app in an iframe. Chrome and Firefox partition framed storage on their
 * own; Safari withholds it, so a framed session would not survive a reload. Ask for storage access
 * from the sign-in gesture. Never call this on page load, and never gate sign-in on the answer: a
 * declined or unsupported request keeps today's behaviour.
 */
export async function ensureFramedSessionStorage(): Promise<void> {
  if (typeof document === 'undefined' || typeof document.hasStorageAccess !== 'function') return;
  try {
    if (!(await document.hasStorageAccess())) await document.requestStorageAccess();
  } catch {
    // Declined, or the browser cannot grant it: the session stays tab-scoped, as before.
  }
}
