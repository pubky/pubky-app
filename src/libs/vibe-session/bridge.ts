import {
  type BridgeRequestResult,
  PUBKY_SESSION_BRIDGE_VERSION,
  PUBKY_SESSION_NONE_TYPE,
  PUBKY_SESSION_REQUEST_TYPE,
  PUBKY_SESSION_TYPE,
  VIBE_SESSION_LOAD_TIMEOUT_MS,
  VIBE_SESSION_REPLY_TIMEOUT_MS,
} from './types';

export function requestFromBridge(
  win: Window,
  bridgeOrigin: string,
  loadTimeoutMs: number = VIBE_SESSION_LOAD_TIMEOUT_MS,
  replyTimeoutMs: number = VIBE_SESSION_REPLY_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<BridgeRequestResult> {
  if (signal?.aborted) {
    return Promise.resolve({ kind: 'aborted' });
  }

  const doc = win.document;
  if (!doc?.createElement || !doc.body) {
    return Promise.resolve({ kind: 'unavailable' });
  }

  return new Promise((resolve) => {
    let settled = false;
    let requested = false;
    let iframe: HTMLIFrameElement | null = null;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    let replyTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: BridgeRequestResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (loadTimer !== undefined) {
        clearTimeout(loadTimer);
        loadTimer = undefined;
      }
      if (replyTimer !== undefined) {
        clearTimeout(replyTimer);
        replyTimer = undefined;
      }
      signal?.removeEventListener('abort', onAbort);
      win.removeEventListener('message', onMessage);
      if (iframe) {
        iframe.removeEventListener('load', onLoad);
        iframe.removeEventListener('error', onError);
        iframe.remove();
      }
      resolve(result);
    };

    const onAbort = () => {
      finish({ kind: 'aborted' });
    };

    const onMessage = (event: MessageEvent) => {
      if (settled) {
        return;
      }
      if (event.origin !== bridgeOrigin) {
        return;
      }
      if (!iframe?.contentWindow || event.source !== iframe.contentWindow) {
        return;
      }
      const data = event.data;
      if (!data || typeof data !== 'object' || (data as { v?: unknown }).v !== PUBKY_SESSION_BRIDGE_VERSION) {
        return;
      }
      const type = (data as { type?: unknown }).type;
      if (type === PUBKY_SESSION_TYPE) {
        const sessionExport = (data as { sessionExport?: unknown }).sessionExport;
        if (typeof sessionExport === 'string' && sessionExport.length > 0) {
          finish({ kind: 'export', sessionExport });
        }
        return;
      }
      if (type === PUBKY_SESSION_NONE_TYPE) {
        finish({ kind: 'none' });
      }
    };

    const onLoad = () => {
      if (settled || requested) {
        return;
      }
      if (loadTimer !== undefined) {
        clearTimeout(loadTimer);
        loadTimer = undefined;
      }
      const contentWindow = iframe?.contentWindow;
      if (!contentWindow) {
        finish({ kind: 'unavailable' });
        return;
      }
      requested = true;
      try {
        contentWindow.postMessage({ type: PUBKY_SESSION_REQUEST_TYPE, v: PUBKY_SESSION_BRIDGE_VERSION }, bridgeOrigin);
      } catch (error) {
        finish({ kind: 'unavailable', error });
        return;
      }
      replyTimer = setTimeout(() => finish({ kind: 'timeout', phase: 'reply' }), replyTimeoutMs);
    };

    const onError = () => {
      finish({ kind: 'unavailable' });
    };

    try {
      signal?.addEventListener('abort', onAbort);
      if (signal?.aborted) {
        onAbort();
        return;
      }
      iframe = doc.createElement('iframe');
      iframe.style.display = 'none';
      iframe.setAttribute('aria-hidden', 'true');
      // allow-same-origin keeps the iframe's real origin so the bridge page can
      // read pubky-app localStorage and so postMessage origin matches bridgeOrigin.
      // allow-scripts lets the bridge page run. Other sandbox flags stay off so
      // the iframe cannot navigate the parent or submit forms.
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.addEventListener('load', onLoad);
      iframe.addEventListener('error', onError);
      win.addEventListener('message', onMessage);
      iframe.src = `${bridgeOrigin}/session-bridge`;
      doc.body.appendChild(iframe);
      loadTimer = setTimeout(() => finish({ kind: 'timeout', phase: 'load' }), loadTimeoutMs);
    } catch (error) {
      finish({ kind: 'unavailable', error });
    }
  });
}
