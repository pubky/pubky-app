import type { ReactNode } from 'react';
import { MobileFooter } from '@/molecules/MobileFooter/MobileFooter';
import { MobileHeader } from '@/molecules/MobileHeader/MobileHeader';
import { Header } from '@/organisms/Header/Header';

/**
 * Signed-in app chrome behind a dialog. Desktop shows the root header; phones
 * hide that header and use the mobile bar and footer, which is what a dialog
 * opened from the app actually sits on.
 */
export function VrtDialogChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <MobileHeader />
      {/* Keep triggers in the top of the viewport. A full-screen spacer before
          them scrolls the control under the fixed mobile footer, which then
          swallows the click. */}
      <div className="min-h-screen px-6 pt-6">{children}</div>
      <MobileFooter />
    </>
  );
}
