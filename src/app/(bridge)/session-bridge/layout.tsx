import type { Metadata } from 'next';
import { SESSION_BRIDGE_EARLY_LISTENER_SCRIPT } from '@/libs/session-bridge/early-listener';

export const metadata: Metadata = {
  title: 'Session bridge',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SessionBridgeLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: SESSION_BRIDGE_EARLY_LISTENER_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
