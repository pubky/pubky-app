'use client';

import {
  createContext,
  lazy,
  type ReactNode,
  Suspense,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UnlockedWallet } from './WalletAccount';

const WalletAccount = lazy(() => import('./WalletAccount').then((module) => ({ default: module.WalletAccount })));

type SurfaceProps = {
  account: string;
  recipient?: string;
  renderReady?: (wallet: UnlockedWallet) => ReactNode;
};
type Surface = SurfaceProps & { outlet: HTMLElement };
type Auth = ReturnType<typeof useAuthStore.getState>;
type Owner = Pick<Auth, 'session' | 'generation'> & {
  account: string;
  key: number;
  reset: () => void;
  onInvalidate: (close: () => void) => () => void;
};
type Snapshot = { owner: Owner; surface: Surface | null } | null;

// One instance per mounted app document. Only visiting a wallet surface can create an owner.
class WalletTab {
  private readonly surfaces = new Map<HTMLElement, Surface>();
  private readonly listeners = new Set<() => void>();
  private snapshot: Snapshot = null;
  private nextKey = 0;
  private active = false;
  private close?: () => void;

  subscribe = (notify: () => void) => {
    this.listeners.add(notify);
    return () => {
      this.listeners.delete(notify);
    };
  };
  read = () => this.snapshot;

  connect() {
    const resume = () => {
      this.active = true;
      this.reconcile();
    };
    const suspend = () => {
      this.active = false;
      this.reconcile();
    };
    const unsubscribe = useAuthStore.subscribe(this.reconcile);
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', resume);
    resume();
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('pageshow', resume);
      suspend();
    };
  }

  show(surface: Surface) {
    this.surfaces.set(surface.outlet, surface);
    this.reconcile();
  }

  remove(outlet: HTMLElement) {
    this.surfaces.delete(outlet);
    this.reconcile();
  }

  private retire() {
    this.snapshot = null;
    const close = this.close;
    this.close = undefined;
    close?.();
  }

  private createOwner(account: string, auth: Auth): Owner {
    const owner: Owner = {
      account,
      session: auth.session,
      generation: auth.generation,
      key: ++this.nextKey,
      reset: () => {
        if (this.snapshot?.owner !== owner) return;
        this.retire();
        this.reconcile();
        // An off-screen reset leaves no replacement to publish.
        if (!this.snapshot) this.notify();
      },
      onInvalidate: (close) => {
        if (this.snapshot?.owner !== owner) close();
        else this.close = close;
        return () => {
          if (this.close === close) this.close = undefined;
        };
      },
    };
    return owner;
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }

  private reconcile = () => {
    const previous = this.snapshot;
    const auth = useAuthStore.getState();
    const account =
      this.active && auth.session && !auth.isLoggingOut && !auth.needsAccountSync ? auth.currentUserPubky : null;
    const owner = previous?.owner;
    if (
      owner &&
      (owner.account !== account || owner.session !== auth.session || owner.generation !== auth.generation)
    ) {
      // Fence the worker in the auth-store event, including when React has no wallet UI mounted.
      this.retire();
    }
    if (account) {
      const matches = [...this.surfaces.values()].filter((surface) => surface.account === account);
      // A checkout dialog can overlay the wallet page. Closing it restores the page outlet.
      const surface = matches.findLast((view) => view.renderReady) ?? matches.at(-1) ?? null;
      if (surface && !this.snapshot) this.snapshot = { owner: this.createOwner(account, auth), surface };
      else if (this.snapshot && this.snapshot.surface !== surface) this.snapshot = { ...this.snapshot, surface };
    }
    if (this.snapshot !== previous) this.notify();
  };
}

const WalletTabContext = createContext<WalletTab | null>(null);
const emptySnapshot = (): Snapshot => null;

function WalletController({ tab }: { tab: WalletTab }) {
  const snapshot = useSyncExternalStore(tab.subscribe, tab.read, emptySnapshot);
  if (!snapshot) return null;
  const { owner, surface } = snapshot;
  return (
    <Suspense fallback={null}>
      <WalletAccount
        key={owner.key}
        account={owner.account}
        outlet={surface?.outlet ?? null}
        recipient={surface?.recipient}
        renderReady={surface?.renderReady}
        reset={owner.reset}
        onInvalidate={owner.onInvalidate}
      />
    </Suspense>
  );
}

export function WalletTabProvider({ children }: { children: ReactNode }) {
  const [tab] = useState(() => new WalletTab());
  useLayoutEffect(() => tab.connect(), [tab]);
  return (
    <WalletTabContext.Provider value={tab}>
      {children}
      <WalletController tab={tab} />
    </WalletTabContext.Provider>
  );
}

export function WalletSurface({ account, recipient, renderReady }: SurfaceProps) {
  const tab = useContext(WalletTabContext);
  const outlet = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = outlet.current;
    if (!element || !tab) return;
    return () => tab.remove(element);
  }, [tab]);
  useLayoutEffect(() => {
    if (outlet.current) tab?.show({ account, recipient, renderReady, outlet: outlet.current });
  }, [account, recipient, renderReady, tab]);
  return <div ref={outlet} className="contents" />;
}
