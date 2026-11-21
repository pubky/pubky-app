/**
 * A platform's embed address that starts playing on load (`autoplay=1`), kept as written otherwise
 * (its `start`, its `#t=`): only for an embed loaded by the viewer's press on Play on.
 */
export function withAutoplay(embedUrl: string): string {
  const url = new URL(embedUrl);
  url.searchParams.set('autoplay', '1');
  return url.toString();
}
