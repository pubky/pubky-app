import net from 'node:net';

// Listens on ::1 for each port and pipes the socket to 127.0.0.1 on the same port.
// SSH forwards and `next start -H 127.0.0.1` only bind IPv4. macOS resolves localhost to ::1,
// so without this the browser and the seed client miss the stack and the app.
// Exits 0 without listening when the runner has no IPv6 loopback.

const ports = process.argv.slice(2).map((value) => Number(value));

if (ports.length === 0 || ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) {
  console.error('usage: node playwright-ipv6-loopback.mjs <port>...');
  process.exit(2);
}

const servers = [];
let pending = ports.length;
let unsupported = 0;

const finish = () => {
  pending -= 1;
  if (pending > 0) return;
  if (unsupported === ports.length) {
    console.log('No IPv6 loopback on this runner; localhost stays on IPv4.');
    process.exit(0);
  }
  if (unsupported > 0) {
    console.error('IPv6 loopback bound only some of the requested ports.');
    process.exit(1);
  }
  console.log(`Forwarding ::1 to 127.0.0.1 for port(s) ${ports.join(' ')}.`);
};

for (const port of ports) {
  const server = net.createServer((client) => {
    const upstream = net.connect({ host: '127.0.0.1', port });
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', close);
    upstream.on('error', close);
    client.pipe(upstream);
    upstream.pipe(client);
  });

  server.on('error', (error) => {
    if (error.code === 'EAFNOSUPPORT' || error.code === 'EADDRNOTAVAIL') {
      unsupported += 1;
      finish();
      return;
    }
    console.error(`::1:${port} failed: ${error.code || error.message}`);
    process.exit(1);
  });

  server.listen({ host: '::1', port, ipv6Only: true }, () => {
    servers.push(server);
    finish();
  });
}

const shutdown = () => {
  for (const server of servers) server.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
