import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import type { McpServer } from '@modelcontextprotocol/server';

export async function runStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
