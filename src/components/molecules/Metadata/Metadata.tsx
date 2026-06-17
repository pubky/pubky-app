import {
  getAuthor,
  getCreator,
  getDefaultUrl,
  getKeywords,
  getLocale,
  getPreviewImage,
  getSiteName,
  getType,
} from '@/config/metadata';

interface MetadataProps {
  title: string;
  description: string;
  image?: string;
  type?: string;
  url?: string;
  siteName?: string;
  locale?: string;
  author?: string;
  keywords?: string;
  robots?: boolean;
  creator?: string;
  site?: string;
  favicon?: string;
}

export function getPWAConfig() {
  return {
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black' as const,
      title: getSiteName(),
    },
  };
}

export function Metadata({
  title,
  description,
  image,
  type,
  url,
  siteName,
  locale,
  author,
  keywords,
  robots = true,
  creator,
  site,
  favicon = '/pubky-favicon.svg',
}: MetadataProps) {
  const defaultUrl = getDefaultUrl();
  const resolvedImage = image ?? getPreviewImage();
  const resolvedType = type ?? getType();
  const resolvedUrl = url ?? defaultUrl;
  const resolvedSiteName = siteName ?? getSiteName();
  const resolvedLocale = locale ?? getLocale();
  const resolvedAuthor = author ?? getAuthor();
  const resolvedKeywords = keywords ?? getKeywords();
  const resolvedCreator = creator ?? getCreator();
  const resolvedSite = site ?? defaultUrl;

  return {
    metadataBase: new URL(defaultUrl),
    title,
    description,
    keywords: resolvedKeywords,
    authors: [{ name: resolvedAuthor }],
    creator: resolvedAuthor,
    icons: {
      icon: favicon,
      shortcut: favicon,
      apple: [
        { url: '/images/manifest/web-app-manifest-180x180.png', sizes: '180x180', type: 'image/png' },
        { url: '/images/manifest/web-app-manifest-152x152.png', sizes: '152x152', type: 'image/png' },
        { url: '/images/manifest/web-app-manifest-144x144.png', sizes: '144x144', type: 'image/png' },
      ],
    },
    openGraph: {
      title,
      description,
      url: resolvedUrl,
      siteName: resolvedSiteName,
      images: [
        {
          url: resolvedImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: resolvedLocale,
      type: resolvedType,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [resolvedImage],
      creator: resolvedCreator,
      site: resolvedSite,
    },
    robots: {
      index: robots,
      follow: robots,
    },
    alternates: {
      canonical: resolvedUrl,
    },
    ...getPWAConfig(),
  };
}
