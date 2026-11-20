// Only these startup requests in the pinned engine are independent of the user's wallet.
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const genesis = '{"jsonrpc":"2.0","id":1,"method":"blockchain.block.header","params":[0]}';
const version = '{"jsonrpc":"2.0","method":"server.version","params":["beignet","1.4"],"id":1}';
const ping = '{"jsonrpc":"2.0","method":"server.ping","params":[],"id":2}';
const sentinel =
  '[{"jsonrpc":"2.0","method":"blockchain.scripthash.get_balance","params":["77ca78f9a84b48041ad71f7cc6ff6c33460c25f0cb99f558f9813ed9e63727dd"],"id":3}]';
const wire = (line) => encoder.encode(line + '\n');
const probes = { genesis: [wire(genesis)], session: [wire(version), wire(ping), wire(sentinel)] };
const publicChecks = wire(ping + '\n' + sentinel);
const maxReplyBytes = 4096;

function bytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function detach(socket) {
  socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
}

function sameBytes(a, b) {
  return a?.length === b?.length && a.every((value, i) => value === b[i]);
}

// The relay carries a newline-delimited TCP stream. A WebSocket frame may split
// a reply or contain multiple replies. Keep the original bytes for delivery.
function replyReader(onReplies, invalid) {
  let rest = new Uint8Array(0);
  return ({ data }) => {
    const part = bytes(data);
    if (!part?.length || rest.length + part.length > maxReplyBytes * 3) return invalid();
    const joined = new Uint8Array(rest.length + part.length);
    joined.set(rest);
    joined.set(part, rest.length);
    const replies = [];
    let start = 0;
    try {
      for (let end = joined.indexOf(10); end !== -1; end = joined.indexOf(10, start)) {
        if (end - start >= maxReplyBytes) return invalid();
        const line = joined.slice(start, end + 1);
        const msg = JSON.parse(decoder.decode(line));
        const value = Array.isArray(msg) && msg.length === 1 ? msg[0] : msg;
        if (
          !Number.isInteger(value?.id) ||
          Array.isArray(msg) !== (value.id === 3) ||
          !('result' in value || 'error' in value)
        )
          return invalid();
        replies.push({ id: value.id, value, line });
        start = end + 1;
      }
    } catch {
      return invalid();
    }
    rest = joined.subarray(start);
    if (rest.length >= maxReplyBytes) return invalid();
    onReplies(replies, rest.length);
  };
}

export function prepareElectrumHandshake(socket, role, abandon, newSocket) {
  const requests = probes[role];
  if (!requests) throw new Error('Unknown Electrum handshake');
  let raw = socket;
  let phase = 'probe';
  let claimed = false;
  let opened = false;
  let sent = 1;
  let matched = 0;
  let target = requests.length;
  const responses = new Map();
  const delivered = new Set();
  let waiting = [];
  let queuedBytes = 0;
  let timeout;

  function cancel() {
    if (phase === 'closed') return;
    phase = 'closed';
    clearTimeout(timeout);
    responses.clear();
    waiting = [];
    detach(raw);
    if (raw.readyState < 2) raw.close();
  }

  function fail() {
    cancel();
    if (!claimed) return abandon();
    adapter.onerror?.(new Event('error'));
    adapter.onclose?.(new Event('close'));
  }

  function open() {
    if (phase === 'closed' || opened || !claimed) return;
    opened = true;
    adapter.onopen?.(new Event('open'));
  }

  function wireErrors() {
    raw.onerror = (event) => {
      if (claimed) adapter.onerror?.(event);
      else fail();
    };
    raw.onclose = (event) => {
      cancel();
      if (claimed) adapter.onclose?.(event);
      else abandon();
    };
  }

  function ordinary() {
    phase = 'ordinary';
    clearTimeout(timeout);
    responses.clear();
    raw.onmessage = (event) => adapter.onmessage?.(event);
    for (const message of waiting) raw.send(message);
    waiting = [];
    queuedBytes = 0;
  }

  function enqueue(data) {
    const message = bytes(data);
    if (!message || waiting.length >= 128 || queuedBytes + message.length > 1024 * 1024) return fail();
    waiting.push(message.slice());
    queuedBytes += message.length;
  }

  // Before any reply reaches the engine, a changed request or unusable reply can
  // safely fall back to a new socket with the engine's original writes in order.
  function reconnect() {
    if (!claimed || delivered.size) return fail();
    phase = 'connecting';
    detach(raw);
    if (raw.readyState < 2) raw.close();
    for (const pending of requests.slice(0, matched)) enqueue(pending);
    try {
      raw = newSocket();
      raw.binaryType = 'arraybuffer';
      wireErrors();
      const start = () => {
        if (phase !== 'connecting') return;
        ordinary();
        open();
      };
      raw.onopen = start;
      if (raw.readyState === 1) queueMicrotask(start);
    } catch {
      fail();
    }
  }

  function deliver() {
    if (phase !== 'probe' && phase !== 'drain') return;
    for (const [id, response] of responses) {
      if (id > matched || delivered.has(id)) continue;
      delivered.add(id);
      // The engine may synchronously write from the final message callback.
      if (delivered.size === target) ordinary();
      adapter.onmessage?.({ data: response.line.buffer });
      if (phase !== 'probe' && phase !== 'drain') return;
    }
    // The version negotiation has already been consumed. Finish outstanding
    // reads on its own socket before allowing the engine to reuse their IDs.
    if (phase === 'drain' && responses.size === target && delivered.size === matched) ordinary();
  }

  function receive(replies, rest) {
    for (const response of replies) {
      const id = response.id;
      if (id < 1 || id > sent || responses.has(id)) return reconnect();
      responses.set(id, response);
    }
    if (responses.size === sent && rest) return reconnect();
    if (sent === 1 && target > 1 && responses.has(1)) {
      if (responses.get(1).value.error) target = 1;
      else {
        sent = target;
        try {
          raw.send(publicChecks);
        } catch {
          return reconnect();
        }
      }
    }
    deliver();
  }

  function prime() {
    try {
      raw.send(requests[0]);
    } catch {
      return reconnect();
    }
    open();
  }

  const adapter = {
    get readyState() {
      return phase === 'closed' ? 3 : opened && raw.readyState === 0 ? 1 : raw.readyState;
    },
    get binaryType() {
      return raw.binaryType;
    },
    set binaryType(value) {
      raw.binaryType = value;
    },
    close: cancel,
    send(data) {
      if (phase === 'closed') throw new Error('Electrum socket closed');
      if (phase === 'ordinary') return raw.send(data);
      if (phase === 'probe') {
        if (matched < target && sameBytes(bytes(data), requests[matched])) {
          matched++;
          queueMicrotask(deliver);
          return;
        }
        if (!delivered.size) reconnect();
        else phase = 'drain';
      }
      if (phase !== 'closed') enqueue(data);
      if (phase === 'drain') deliver();
    },
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
  };

  raw.binaryType = 'arraybuffer';
  wireErrors();
  raw.onopen = prime;
  raw.onmessage = replyReader(receive, reconnect);
  if (raw.readyState === 1) prime();
  return {
    claim() {
      if (claimed || phase === 'closed') throw new Error('Electrum socket unavailable');
      claimed = true;
      timeout = setTimeout(fail, 5000);
      if (raw.readyState === 1) queueMicrotask(open);
      return adapter;
    },
    cancel,
  };
}
