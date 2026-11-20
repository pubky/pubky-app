'use client';

import { useState } from 'react';
import { BookOpen, FileText, Globe, Link2, MapPin } from 'lucide-react';
import { Image } from '@/atoms/Image/Image';
import { AppleMusic, PubkyIcon } from '@/icons';
import { getLinkHost } from './ResourceCard.utils';
import { getFaviconUrls } from './ResourceSourceIcon.utils';

const ICON_SIZE = 16;
const ICON_PROPS = { size: ICON_SIZE, 'aria-hidden': true, className: 'shrink-0 text-muted-foreground' } as const;

/**
 * Services whose favicon is not the mark people know them by, drawn from `@/icons` instead of
 * asking the site. Apple Music's favicon (and every icon its pages declare) is Apple's white square
 * with a black note, not the red app icon. Keep it tiny: every other site shows its own favicon.
 */
const BRAND_ICONS: Readonly<Record<string, typeof AppleMusic>> = {
  'music.apple.com': AppleMusic,
  'geo.music.apple.com': AppleMusic,
  'itunes.apple.com': AppleMusic,
};

/** An icon for a URI that is not a web page: its scheme says what it is, there is no site to ask. */
function SchemeIcon({ uri }: { uri: string }) {
  const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(uri)?.[0].toLowerCase();
  switch (scheme) {
    case 'isbn:':
      return <BookOpen {...ICON_PROPS} />;
    case 'doi:':
      return <FileText {...ICON_PROPS} />;
    case 'geo:':
      return <MapPin {...ICON_PROPS} />;
    case 'pubky:':
      return <PubkyIcon {...ICON_PROPS} />;
    default:
      return <Link2 {...ICON_PROPS} />;
  }
}

interface ResourceSourceIconProps {
  /** The link the source stands for. */
  uri: string;
}

/**
 * The site's own favicon (`https://<host>/favicon.ico`) for a web link, then its parent domain's
 * when that fails (`open.qobuz.com` → `qobuz.com`), a globe when both fail, and an icon for the
 * kind of identifier (`isbn:`, `doi:`, `pubky://`) otherwise. A few services whose favicon is not
 * their known mark (Apple Music, `BRAND_ICONS`) get a bundled icon instead. Decorative: the site
 * name is always shown next to it.
 */
export function ResourceSourceIcon({ uri }: ResourceSourceIconProps) {
  const [failedUrls, setFailedUrls] = useState<readonly string[]>([]);
  const host = getLinkHost(uri);
  const BrandIcon = host ? BRAND_ICONS[host] : undefined;
  if (BrandIcon) {
    return (
      <BrandIcon size={ICON_SIZE} aria-hidden data-testid="resource-source-brand" className="shrink-0 rounded-sm" />
    );
  }

  const faviconUrls = getFaviconUrls(uri);
  const faviconUrl = faviconUrls.find((url) => !failedUrls.includes(url));

  if (faviconUrl) {
    return (
      <Image
        // A fresh element per candidate, so the next one is loaded rather than the failed one kept.
        key={faviconUrl}
        src={faviconUrl}
        alt=""
        width={ICON_SIZE}
        height={ICON_SIZE}
        data-testid="resource-source-favicon"
        className="size-4 shrink-0 rounded-sm"
        onError={() => setFailedUrls((failed) => [...failed, faviconUrl])}
      />
    );
  }

  return faviconUrls.length > 0 ? <Globe {...ICON_PROPS} /> : <SchemeIcon uri={uri} />;
}
