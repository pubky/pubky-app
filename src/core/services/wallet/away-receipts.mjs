const decoder = new TextDecoder();
const encoder = new TextEncoder();
const validHash = /^[0-9a-f]{64}$/;
// The engine asks its primary for offline receipts every two seconds. The first
// connected Activity read may still contain only the pre-close invoice state.
const reconciliationMs = 8_000;

// A request's Activity timestamp can be its issue time or its local reconciliation
// time. Compare verified observations across a lock or a visibility change instead.
export function createAwayReceipts(volume, hidden, now = Date.now) {
  let walletId;
  let states;
  let returning;
  let returnedAt = now();
  const connectedSince = new Map();

  function waiting() {
    return new Set(Object.keys(states).filter((hash) => states[hash] === 'waiting'));
  }

  function load(id) {
    if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) throw new Error('Invalid wallet id.');
    if (id === walletId) return;
    const registry = volume.read('/wallet/registry.json');
    if (!registry || JSON.parse(decoder.decode(registry))?.record?.id !== id)
      throw new Error('The receipts do not match this wallet.');
    const bytes = volume.read('/pubky/away-receipts-v1/' + id);
    const stored = bytes ? JSON.parse(decoder.decode(bytes)) : {};
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error('Unreadable wallet receipts.');
    if (stored.draft !== undefined) validateDraft(stored.draft);
    states = stored;
    connectedSince.clear();
    returning = waiting();
    walletId = id;
  }

  function commit(next) {
    volume.write('/pubky/away-receipts-v1/' + walletId, encoder.encode(JSON.stringify(next)));
    states = next;
  }

  function validateDraft(draft) {
    if (
      !draft ||
      typeof draft.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{16,160}$/.test(draft.id) ||
      !Number.isSafeInteger(draft.amountSats) ||
      draft.amountSats <= 0 ||
      draft.amountSats > 2_100_000_000_000_000 ||
      typeof draft.description !== 'string' ||
      draft.description.length > 256 ||
      (draft.peer !== undefined && (typeof draft.peer !== 'string' || !/^0[23][a-f0-9]{64}$/.test(draft.peer)))
    )
      throw new Error('The saved offline request could not be read.');
    return {
      id: draft.id,
      amountSats: draft.amountSats,
      description: draft.description,
      ...(draft.peer ? { peer: draft.peer } : {}),
    };
  }

  return {
    draft(id) {
      load(id);
      return states.draft ?? null;
    },
    begin(id, input) {
      load(id);
      const draft = validateDraft(input);
      if (states.draft) {
        const saved = states.draft;
        if (
          saved.id !== draft.id ||
          saved.amountSats !== draft.amountSats ||
          saved.description !== draft.description ||
          saved.peer !== draft.peer
        )
          throw new Error('Resume the saved offline request before creating another.');
        return;
      }
      commit({ ...states, draft });
    },
    issued(id, request) {
      load(id);
      const draft = states.draft;
      const hash = request?.paymentHash;
      if (
        !draft ||
        request?.id !== draft.id ||
        request.amountSats !== draft.amountSats ||
        request.description !== draft.description ||
        (request.peer !== undefined && draft.peer !== undefined && request.peer !== draft.peer) ||
        request.offlineReceive !== true ||
        request.demo !== false ||
        typeof hash !== 'string' ||
        !validHash.test(hash)
      )
        throw new Error('The saved invoice does not match this offline request.');
      // A single encrypted commit hands the draft over to Activity before the QR is exposed.
      const next = { ...states, [hash]: states[hash] ?? 'waiting' };
      delete next.draft;
      commit(next);
      if (hidden && states[hash] === 'waiting') returning.add(hash);
    },
    discard(id, requestId) {
      load(id);
      if (!states.draft) return;
      if (requestId !== states.draft.id) throw new Error('The saved offline request changed.');
      const next = { ...states };
      delete next.draft;
      commit(next);
    },
    setHidden(next) {
      if (next && !hidden && states) {
        returning = waiting();
        connectedSince.clear();
      }
      if (!next && hidden) returnedAt = now();
      hidden = next;
    },
    observe(id, rows, primaryConnected = true) {
      load(id);
      const next = { ...states };
      const observed = [];
      let changed = false;
      const time = now();
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

        // If an invoice had already expired before return, even a delayed
        // receipt can only belong to a payment accepted while it was payable.
        const expiredOnReturn = Number.isFinite(request.expiresAt) && request.expiresAt <= returnedAt;
        const connectedAt = connectedSince.get(hash);
        const reconciling =
          hidden || expiredOnReturn || connectedAt === undefined || time - connectedAt < reconciliationMs;
        let state;
        if (row.kind === 'request' && row.status === 'pending' && proof.phase === 'waiting') {
          state = 'waiting';
          if (!hidden && primaryConnected && returning.has(hash) && connectedAt === undefined)
            connectedSince.set(hash, time);
        } else if (row.kind === 'received' && row.status === 'completed' && proof.phase === 'completed') {
          const lightning = proof.method === 'lightning' && proof.paymentHash === hash;
          state = lightning && returning.has(hash) && reconciling ? 'away' : 'seen';
        } else {
          continue;
        }
        if (state !== next[hash]) {
          next[hash] = state;
          changed = true;
        }
        if (state !== 'waiting' || !reconciling) observed.push(hash);
      }
      if (changed) commit(next);
      for (const hash of observed) {
        returning.delete(hash);
        connectedSince.delete(hash);
      }
      return Object.keys(states).filter((hash) => states[hash] === 'away');
    },
  };
}
