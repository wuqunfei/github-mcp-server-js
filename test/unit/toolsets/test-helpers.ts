import { McpServer } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { Octokit } from 'octokit';

export type Permission = 'read-only' | 'read-write';

export type RegisterTools = (server: McpServer, octokit: Octokit, permission: Permission) => void;

/**
 * Builds a test Octokit client with retry and throttling disabled.
 *
 * Both plugins are bundled in `octokit` and enabled by default. Without
 * disabling them here, any test that mocks a retryable status (409, 429,
 * 5xx) would silently hang for several seconds waiting out real retry/
 * throttle backoff before the mocked response is asserted against.
 */
export function testOctokit(): Octokit {
  return new Octokit({
    auth: 'test-token',
    baseUrl: 'https://api.github.com',
    retry: { enabled: false },
    throttle: { enabled: false },
  });
}

/**
 * Wires up a registerTools function against an in-memory MCP client/server
 * pair, backed by a test Octokit client with retry/throttling disabled.
 * Shared by all toolset test files to avoid drift between local copies.
 */
export async function connectedClient(
  registerTools: RegisterTools,
  permission: Permission,
): Promise<Client> {
  const octokit = testOctokit();
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  registerTools(server, octokit, permission);

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}
