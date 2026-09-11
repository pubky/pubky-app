import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';

interface AppDownloadProps {
  logo: { src: string; alt: string; width: number };
  appStoreUrl: string;
  playStoreUrl: string;
  layout?: 'row' | 'column';
}

/** App wordmark and its two store badges. */
export function AppDownload({ logo, appStoreUrl, playStoreUrl, layout = 'column' }: AppDownloadProps) {
  const badges = (
    <>
      <Link href={appStoreUrl} target="_blank">
        <Image src="/images/badge-apple.webp" alt="App Store" width={72} height={24} />
      </Link>
      <Link href={playStoreUrl} target="_blank">
        <Image src="/images/badge-android.webp" alt="Google Play" width={81} height={24} />
      </Link>
    </>
  );

  return (
    <Container
      overrideDefaults={layout === 'row'}
      className={layout === 'row' ? 'flex flex-wrap items-center gap-3.5' : 'flex flex-col items-center gap-4'}
    >
      <Image src={logo.src} alt={logo.alt} width={logo.width} height={32} />
      {layout === 'row' ? (
        badges
      ) : (
        <Container className="flex flex-row items-center justify-center gap-3.5">{badges}</Container>
      )}
    </Container>
  );
}
