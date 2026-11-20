import { createWebSocketStream } from 'ws';

const alpn = Array.from(Buffer.from('beignet/bolt8/1'));

/** Carry opaque BOLT8 bytes on a single authenticated Iroh bidirectional stream. */
export async function bridgeIroh(ws, target) {
  const socket = createWebSocketStream(ws);
  let endpoint;
  let connection;
  let closed = false;
  const close = () => {
    closed = true;
    connection?.close(0n, []);
    void endpoint?.close().catch(() => {});
  };
  ws.once('close', close);
  socket.on('error', close);
  const timer = setTimeout(() => {
    ws.close(1011, 'BEIGNET_UPSTREAM_UNAVAILABLE');
    close();
  }, 20_000);
  try {
    const { default: binding } = await import('@number0/iroh/index.js');
    const { Endpoint, EndpointAddr, EndpointId, RelayMode } = binding;
    const builder = Endpoint.builder();
    builder.applyMinimal();
    builder.relayMode(RelayMode.customFromUrls([target.relayUrl]));
    builder.alpns([]);
    builder.bindAddr('127.0.0.1:0');
    endpoint = await builder.bind();
    if (closed) return;
    const peer = new EndpointAddr(
      EndpointId.fromBytes(Array.from(Buffer.from(target.endpointId, 'hex'))),
      target.relayUrl,
      [],
    );
    connection = await endpoint.connect(peer, alpn);
    if (closed) return;
    connection.setMaxConcurrentBiStreams(0n);
    connection.setMaxConcurrentUniStreams(0n);
    const stream = await connection.openBi();
    clearTimeout(timer);
    const fromBrowser = async () => {
      for await (const bytes of socket) await stream.send.writeAll(Array.from(bytes));
    };
    const toBrowser = async () => {
      while (!closed) {
        const bytes = await stream.recv.read(32 * 1024);
        if (!bytes.length) return;
        await new Promise((resolve, reject) => {
          ws.send(Buffer.from(bytes), (error) => (error ? reject(error) : resolve()));
        });
      }
    };
    await Promise.race([fromBrowser(), toBrowser(), connection.closed()]);
    ws.close();
  } catch {
    ws.close(1011, 'BEIGNET_UPSTREAM_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
    close();
    socket.destroy();
  }
}
