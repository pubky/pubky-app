const channelEvents = ['channel:ready', 'splice:complete', 'splice:aborted', 'splice:reverted'];

/** A primary's transport can connect before its funded channel can carry a payment. */
export function primaryChannelReadiness(primaryKey, onUsable) {
  let currentNode;
  let checkedFunding = new Set();
  return {
    id: 'pubky-channel-readiness',
    version: '1',
    api: 1,
    observeFunding(rows) {
      if (!currentNode || !Array.isArray(rows)) return;
      const held = new Set();
      for (const row of rows) {
        if (
          typeof row?.state !== 'string' ||
          typeof row.channelId !== 'string' ||
          !/^[0-9a-f]{64}$/i.test(row.channelId)
        )
          return;
        if (row.fundingUnaccounted === true && !['CLOSED', 'FORCE_CLOSED', 'DROPPED'].includes(row.state)) {
          held.add(row.channelId);
        }
      }
      if ([...held].every((id) => checkedFunding.has(id))) {
        checkedFunding = held;
        return;
      }
      // Only the engine can lift a hold. Wake its ordinary Electrum watches
      // once per observed episode, without starting another address scan.
      try {
        if (!currentNode.recoveryPermitsPeerTraffic?.()) return;
        const watcher = currentNode.getChainWatcher?.();
        if (!watcher) return;
        checkedFunding = held;
        watcher.recheckAllWatches();
      } catch {
        // The watcher's normal polling still owns retries. Keep the channel read usable.
      }
    },
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
          currentNode = node;
          checkedFunding = new Set();
        },
        stop() {
          if (currentNode === node) {
            currentNode = undefined;
            checkedFunding.clear();
          }
          clearTimeout(timer);
          pending.clear();
          manager?.off('channel:reestablished', checkAfterDispatch);
          for (const event of channelEvents) node?.off(event, onNodeEvent);
        },
      };
    },
  };
}
