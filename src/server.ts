import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { registerReposTools } from './toolsets/repos.js';

const SERVER_NAME = 'github-mcp-server-js';
const SERVER_VERSION = '0.1.0';

export function buildServer(
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  registerReposTools(server, octokit, permission);

  return server;
}
