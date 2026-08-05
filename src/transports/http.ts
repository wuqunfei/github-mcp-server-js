import { createServer } from 'node:http';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { createServerAdapter } from '@whatwg-node/server';

export async function runHttp(server: McpServer, port: number): Promise<void> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await server.connect(transport);

  const adapter = createServerAdapter((request: Request) => transport.handleRequest(request));
  const httpServer = createServer(adapter);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, resolve);
  });
}
