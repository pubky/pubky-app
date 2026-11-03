/** Where an iframe's ready wait was counted from when it timed out. */
export type IframeReadyCountedFrom = 'mount' | 'load';

export type UseIframeReadyParams = {
  /** Identifies the embedded page (its URL); a new key starts a fresh wait. `null` when there is no page. */
  key: string | null;
  /** True while the flow shows the page and needs it to render (e.g. awaiting approval). */
  isWaiting: boolean;
  /** True when a `message` event is this page's ready report (origin, iframe source and payload checked). */
  isReadyMessage: (event: MessageEvent) => boolean;
  /** Called once when the page did not report it rendered in time. */
  onTimeout: (countedFrom: IframeReadyCountedFrom) => void;
};

export type UseIframeReadyReturn = {
  /** True once the current page posted its ready report; the iframe stays hidden until then. */
  isReady: boolean;
  /** Attach to the iframe's `onLoad`: starts the short wait for the ready report. */
  onLoad: () => void;
};
