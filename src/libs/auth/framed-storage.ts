/** Request persistent access for a framed Pubky session during a sign-in gesture. */
export async function ensureFramedSessionStorage(): Promise<void> {
  if (window.self === window.top || typeof document.hasStorageAccess !== 'function') return;
  try {
    if (!(await document.hasStorageAccess())) await document.requestStorageAccess();
  } catch {
    // The browser can still use this session if it declines persistent storage.
  }
}
