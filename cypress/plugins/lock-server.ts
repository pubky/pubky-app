import { createServer } from 'http';
import type { AddressInfo } from 'net';
import type { SeedLockServerWriteArgs } from '../support/types/seed';

// The spec's intercept handlers call this from the app's origin
const CORS_HEADERS = { 'access-control-allow-origin': '*' };

/**
 * Serves the stand-in Lock Server's homeserver writes (`seedLockServerWrite`) over HTTP on an
 * ephemeral local port, and resolves with its URL.
 *
 * The real Lock Server writes before it answers the app, so the Locks spec's intercept handlers must
 * wait for the write. A handler cannot run `cy.task`, but it can `fetch` the write here and answer
 * the app once this replies: 204 when the write landed, 500 when not.
 */
export const startLockServerWrites = (write: (args: SeedLockServerWriteArgs) => Promise<unknown>) =>
  new Promise<string>((resolve) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        Promise.resolve()
          .then(() => write(JSON.parse(Buffer.concat(chunks).toString())))
          .then(
            () => res.writeHead(204, CORS_HEADERS).end(),
            (error) => {
              console.error(`[lock-server] ${error}`);
              res.writeHead(500, { ...CORS_HEADERS, 'content-type': 'text/plain' }).end(String(error));
            },
          );
      });
    });
    server.unref();
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  });
