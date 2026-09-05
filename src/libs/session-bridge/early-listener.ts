export const SESSION_BRIDGE_PENDING_KEY = '__pubkySessionBridgePending';
export const SESSION_BRIDGE_DISPATCH_KEY = '__pubkySessionBridgeDispatch';

/**
 * Runs in the document before React hydrates. Queues `message` events until the
 * client module swaps in `createSessionBridgeHandler`. Cannot import the handler
 * from this inline script (no bundler graph in the HTML), so it only queues.
 */
export const SESSION_BRIDGE_EARLY_LISTENER_SCRIPT = `(function(){
  if (window.top === window.self) return;
  window.${SESSION_BRIDGE_PENDING_KEY} = [];
  window.${SESSION_BRIDGE_DISPATCH_KEY} = function(event) {
    window.${SESSION_BRIDGE_PENDING_KEY}.push(event);
  };
  window.addEventListener('message', function(event) {
    window.${SESSION_BRIDGE_DISPATCH_KEY}(event);
  });
})();`;

type SessionBridgeEarlyWindow = Window & {
  [SESSION_BRIDGE_PENDING_KEY]?: MessageEvent[];
  [SESSION_BRIDGE_DISPATCH_KEY]?: (event: MessageEvent) => void;
};

export function getSessionBridgeEarlyWindow(target: Window = window): SessionBridgeEarlyWindow {
  return target as SessionBridgeEarlyWindow;
}
