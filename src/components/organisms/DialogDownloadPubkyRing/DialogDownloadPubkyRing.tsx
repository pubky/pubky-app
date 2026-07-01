import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { Container } from '@/atoms/Container/Container';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/atoms/Dialog/Dialog';
import { Link } from '@/atoms/Link/Link';
import { getAppStoreLink, getPlayStoreLink } from '@/config/externalLinks';

interface DialogDownloadPubkyRingProps {
  store?: 'apple' | 'android';
}

export function DialogDownloadPubkyRing({ store = 'apple' }: DialogDownloadPubkyRingProps) {
  const imageBadge =
    store === 'apple'
      ? {
          src: '/images/badge-apple.webp',
          alt: 'App Store',
          width: 120,
          height: 40,
          href: getAppStoreLink(),
        }
      : {
          src: '/images/badge-android.webp',
          alt: 'Google Play',
          width: 135,
          height: 40,
          href: getPlayStoreLink(),
        };

  return (
    <Dialog>
      {store === 'apple' ? (
        <Link href={imageBadge.href} target="_blank" className="block sm:hidden">
          <Image src={imageBadge.src} alt={imageBadge.alt} width={192} height={40} />
        </Link>
      ) : (
        <Link href={imageBadge.href} target="_blank" className="block sm:hidden">
          <Image src={imageBadge.src} alt={imageBadge.alt} width={210} height={40} />
        </Link>
      )}
      <DialogTrigger asChild className="hidden cursor-pointer sm:block">
        {store === 'apple' ? (
          <Image src="/images/badge-apple.webp" alt="App Store" width={120} height={40} />
        ) : (
          <Image src="/images/badge-android.webp" alt="Google Play" width={135} height={40} />
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[384px]" hiddenTitle="Download Pubky Ring">
        <DialogHeader className="pr-6">
          <DialogTitle>Download Pubky Ring</DialogTitle>
          <DialogDescription className="text-sm font-medium">
            Scan the QR with your mobile camera to download Pubky Ring from the App Store.
          </DialogDescription>
        </DialogHeader>
        <Container className="mt-6">
          <Container className="flex-row items-center gap-8">
            <Image src="/images/pubky-ring-phone.webp" alt="App preview" width={96} height={256} />
            <Container className="space-y-6">
              <Container className="flex h-[192px] w-[192px] items-center justify-center rounded-lg bg-foreground p-4">
                <QRCodeSVG value={imageBadge.href} size={160} />
              </Container>
              <Container className="items-center justify-between">
                <Link className="h-10 w-full" href={imageBadge.href} target="_blank">
                  <Image
                    src={imageBadge.src}
                    alt={imageBadge.alt}
                    width={imageBadge.width}
                    height={imageBadge.height}
                  />
                </Link>
              </Container>
            </Container>
          </Container>
        </Container>
      </DialogContent>
    </Dialog>
  );
}
