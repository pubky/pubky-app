'use client';

import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/atoms/Button/Button';
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

import { APP_STORE_URL, PLAY_STORE_URL, PUBKY_CORE_URL } from '@/config/externalLinks';
import { generatePubkyRingDeeplink } from '@/libs/deeplink/deeplink';
import type { TMnemonicWords } from '@/libs/identity/identity.types';

interface DialogBackupExportProps {
  mnemonic?: TMnemonicWords | null;
  children?: React.ReactNode;
}

const IMPORT_DESCRIPTION = (
  <>
    1. Open Pubky Ring, tap &apos;Add pubky&apos; <br />
    2. Choose &apos;Import pubky&apos; option <br />
    3. Tap &apos;Scan QR to import&apos; <br />
    4. Scan this QR code to import your recovery phrase
  </>
);

const EXPORT_DESCRIPTION = (
  <>
    1. Open Pubky Ring, tap &apos;Add pubky&apos; <br />
    2. Choose the &apos;Import pubky&apos; option
    <br />
    3. Scan this QR to import
  </>
);

const MOBILE_EXPORT_DESCRIPTION =
  'Tap the button below to export your pubky and import it into Pubky Ring for a safer and easier sign-in experience.';

const MOBILE_IMPORT_DESCRIPTION =
  'Tap the button below to import your recovery phrase into Pubky Ring for a safer and easier sign-in experience.';

export function DialogBackupExport({ mnemonic, children }: DialogBackupExportProps) {
  const qrValue = mnemonic ? generatePubkyRingDeeplink(mnemonic) : PUBKY_CORE_URL;
  const descriptionContent = mnemonic ? IMPORT_DESCRIPTION : EXPORT_DESCRIPTION;
  const mobileDescription = mnemonic ? MOBILE_IMPORT_DESCRIPTION : MOBILE_EXPORT_DESCRIPTION;
  const dialogTitle = mnemonic ? 'Import recovery phrase' : 'Pubky Ring export';

  const handleMobileButtonClick = () => {
    if (typeof window !== 'undefined') {
      const url = mnemonic ? generatePubkyRingDeeplink(mnemonic) : PUBKY_CORE_URL;
      window.open(url, '_blank');
    }
  };

  return (
    <Dialog>
      {children ? (
        <DialogTrigger asChild>{children}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button>Continue</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md" hiddenTitle={dialogTitle}>
        {/* Desktop version - hidden on mobile, shown on desktop */}
        <div className="hidden flex-col gap-6 lg:flex">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{descriptionContent}</DialogDescription>
          </DialogHeader>

          <Container className="items-start justify-between">
            <Container className="flex-row gap-8">
              <Container>
                <Image src="/images/pubky-ring-phone.webp" alt="App preview" width={250} height={430} />
              </Container>

              <Container className="gap-6">
                <Container className="relative mx-0 h-[192px] w-[192px] items-center rounded-lg bg-foreground p-[9px]">
                  <QRCodeSVG value={qrValue} size={174} />
                  <Image
                    src="/images/ring-logo.svg"
                    alt="Pubky Ring"
                    width={42}
                    height={42}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                  />
                </Container>
                <Container className="gap-4">
                  <Link href={APP_STORE_URL} target="_blank">
                    <Image src="/images/badge-apple.webp" alt="App Store" width={120} height={40} />
                  </Link>
                  <Link href={PLAY_STORE_URL} target="_blank">
                    <Image src="/images/badge-android.webp" alt="Google Play" width={135} height={40} />
                  </Link>
                </Container>
              </Container>
            </Container>
          </Container>
        </div>

        {/* Mobile version - shown on mobile, hidden on desktop */}
        <div className="flex flex-col gap-6 lg:hidden">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{mobileDescription}</DialogDescription>
          </DialogHeader>

          <Container className="gap-3">
            <Button onClick={handleMobileButtonClick} className="w-full">
              Import to Pubky Ring
            </Button>
          </Container>
        </div>
      </DialogContent>
    </Dialog>
  );
}
