import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { createServerAdapter } from '@whatwg-node/server';

/**
 * Starts serving `server` over Streamable HTTP on `port` and resolves once
 * the underlying Node `http.Server` is listening. The `http.Server` is
 * returned so callers (in particular tests) can close it; `cli.ts` ignores
 * the return value and simply keeps the process alive.
 */
export async function runHttp(server: McpServer, port: number): Promise<Server> {
  // `WebStandardStreamableHTTPServerTransport` supports exactly one active
  // session at a time: it starts out unattached (before the first
  // `initialize` request), then becomes attached to a single generated
  // session ID, and once that session is closed (a `DELETE` request) the
  // transport instance is permanently closed and starts rejecting every
  // subsequent request with 404 "Session not found" - even though the
  // underlying Node `http.Server` is still listening.
  //
  // To let the server accept a fresh session after the previous one ends,
  // we swap in a brand-new transport (connected to the same, already-built
  // `McpServer` / single `Octokit` instance) whenever the active session
  // closes. `activeTransport` always points at whichever transport instance
  // should handle the next incoming request; the Node http.Server and port
  // binding are never restarted.
  //
  // The reconnect is wired off the transport's `onclose` hook rather than
  // its `onsessionclosed` option, and deferred with `queueMicrotask`. Both
  // details matter: `McpServer.connect()` (via the underlying `Protocol`)
  // wraps whatever `onclose` was already set on the transport, and its own
  // teardown (`Protocol._onclose`), which runs the wrapped hook and then
  // clears the server's shared `_transport` reference, itself runs from a
  // `.close()` call made by this very transport implementation. Reconnecting
  // synchronously - from `onsessionclosed`, which fires *before* that
  // `.close()`/`_onclose` sequence completes - connects the new transport
  // and then loses it when `_onclose` unconditionally resets `_transport` to
  // `undefined` right afterwards. Deferring the reconnect to a microtask
  // lets that teardown finish first, so the new transport becomes (and
  // stays) the server's connected transport.
  let activeTransport: WebStandardStreamableHTTPServerTransport;

  async function connectFreshTransport(): Promise<void> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    transport.onclose = () => {
      queueMicrotask(() => {
        void connectFreshTransport();
      });
    };
    await server.connect(transport);
    activeTransport = transport;
  }

  await connectFreshTransport();

  const adapter = createServerAdapter((request: Request) => activeTransport.handleRequest(request));
  const httpServer = createServer(adapter);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, resolve);
  });

  return httpServer;
}
