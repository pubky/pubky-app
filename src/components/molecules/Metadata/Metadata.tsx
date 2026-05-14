import {
  DEFAULT_AUTHOR,
  DEFAULT_CREATOR,
  DEFAULT_KEYWORDS,
  DEFAULT_LOCALE,
  DEFAULT_PREVIEW_IMAGE,
  DEFAULT_SITE_NAME,
  DEFAULT_TYPE,
  DEFAULT_URL,
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
      title: DEFAULT_SITE_NAME,
    },
  };
}

export function Metadata({
  title,
  description,
  image = DEFAULT_PREVIEW_IMAGE,
  type = DEFAULT_TYPE,
  url = DEFAULT_URL,
  siteName = DEFAULT_SITE_NAME,
  locale = DEFAULT_LOCALE,
  author = DEFAULT_AUTHOR,
  keywords = DEFAULT_KEYWORDS,
  robots = true,
  creator = DEFAULT_CREATOR,
  site = DEFAULT_URL,
  favicon = '/pubky-favicon.svg',
}: MetadataProps) {
  return {
    metadataBase: new URL(DEFAULT_URL),
    title,
    description,
    keywords,
    authors: [{ name: author }],
    creator: author,
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
      url,
      siteName,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale,
      type,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
      creator,
      site,
    },
    robots: {
      index: robots,
      follow: robots,
    },
    alternates: {
      canonical: url,
    },
    ...getPWAConfig(),
  };
}
