const decoder = new TextDecoder();
const encoder = new TextEncoder();
const validHash = /^[0-9a-f]{64}$/;

// A request's Activity timestamp can be its issue time or its local reconciliation
// time. Compare verified observations across a lock or a visibility change instead.
export function createAwayReceipts(volume, hidden) {
  let walletId;
  let states;
  let returning;

  function waiting() {
    return new Set(Object.keys(states).filter((hash) => states[hash] === 'waiting'));
  }

  return {
    setHidden(next) {
      if (next && !hidden && states) returning = waiting();
      hidden = next;
    },
    observe(id, rows, primaryConnected = true) {
      if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('Invalid wallet id.');
      const path = '/pubky/away-receipts-v1/' + id;
      if (id !== walletId) {
        const registry = volume.read('/wallet/registry.json');
        if (!registry || JSON.parse(decoder.decode(registry))?.record?.id !== id)
          throw new Error('The receipts do not match this wallet.');
        const bytes = volume.read(path);
        states = bytes ? JSON.parse(decoder.decode(bytes)) : {};
        returning = waiting();
        walletId = id;
      }

      const next = { ...states };
      const observed = [];
      let changed = false;
      for (const row of rows) {
        const hash = row.paymentHash;
        const request = row.receiveRequest;
        const proof = row.receiveStatus;
        if (
          typeof hash !== 'string' ||
          !validHash.test(hash) ||
          request?.offlineReceive !== true ||
          request.demo ||
          request.paymentHash !== hash ||
          row.receiveStatusUnavailable ||
          !proof ||
          next[hash] === 'away' ||
          next[hash] === 'seen'
        )
          continue;

        let state;
        if (row.kind === 'request' && row.status === 'pending' && proof.phase === 'waiting') {
          state = 'waiting';
        } else if (row.kind === 'received' && row.status === 'completed' && proof.phase === 'completed') {
          const lightning = proof.method === 'lightning' && proof.paymentHash === hash;
          state = lightning && returning.has(hash) ? 'away' : 'seen';
        } else {
          continue;
        }
        if (state !== next[hash]) {
          next[hash] = state;
          changed = true;
        }
        // The engine can still report a locally waiting invoice before its
        // primary reconnects. Let reconciliation on return decide that receipt.
        if (!hidden && (primaryConnected || state !== 'waiting')) observed.push(hash);
      }
      if (changed) {
        volume.write(path, encoder.encode(JSON.stringify(next)));
        states = next;
      }
      for (const hash of observed) returning.delete(hash);
      return Object.keys(states).filter((hash) => states[hash] === 'away');
    },
  };
}
