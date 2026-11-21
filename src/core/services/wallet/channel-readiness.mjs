const channelEvents = ['channel:ready', 'splice:complete', 'splice:aborted', 'splice:reverted'];

/** A primary's transport can connect before its funded channel can carry a payment. */
export function primaryChannelReadiness(primaryKey, onUsable) {
  return {
    id: 'pubky-channel-readiness',
    version: '1',
    api: 1,
    attach() {
      let node;
      let manager;
      let timer;
      const pending = new Set();

      function checkAfterDispatch(channelId) {
        pending.add(channelId);
        if (timer !== undefined) return;
        // Reestablish and splice events can share a dispatch. Read the settled
        // channel state once and send only an invalidation to the dashboard.
        timer = setTimeout(() => {
          timer = undefined;
          const usable = Array.from(pending).some(
            (id) => manager.getPeerForChannel(id) === primaryKey && manager.getChannel(id)?.acceptsNewHtlcs(),
          );
          pending.clear();
          if (usable) onUsable();
        }, 0);
      }

      const onNodeEvent = ({ channelId }) => checkAfterDispatch(channelId);
      return {
        bind(boundNode) {
          node = boundNode;
        },
        start() {
          manager = node.getChannelManager();
          manager.on('channel:reestablished', checkAfterDispatch);
          for (const event of channelEvents) node.on(event, onNodeEvent);
          // A restored peer can finish reconnecting before extension start().
          for (const channel of manager.getChannelsByPeer(primaryKey)) {
            const id = channel.getChannelId();
            if (id) checkAfterDispatch(id);
          }
        },
        stop() {
          clearTimeout(timer);
          pending.clear();
          manager?.off('channel:reestablished', checkAfterDispatch);
          for (const event of channelEvents) node?.off(event, onNodeEvent);
        },
      };
    },
  };
}
