export type BrowserNavigator = Pick<Navigator, 'platform' | 'userAgent'> & Partial<Pick<Navigator, 'maxTouchPoints'>>;

const IOS_USER_AGENT_PATTERN = /iPad|iPhone|iPod/;

export function isIOSBrowser(targetNavigator?: BrowserNavigator): boolean {
  const browserNavigator = targetNavigator ?? (typeof navigator === 'undefined' ? undefined : navigator);
  if (!browserNavigator) return false;

  return (
    IOS_USER_AGENT_PATTERN.test(browserNavigator.userAgent) ||
    (browserNavigator.platform === 'MacIntel' && (browserNavigator.maxTouchPoints ?? 0) > 1)
  );
}
