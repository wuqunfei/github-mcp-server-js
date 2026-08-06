import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import type { Logger } from './logger.js';
import { registerActionsTools } from './toolsets/actions.js';
import { registerActivityTools } from './toolsets/activity.js';
import { registerAppsTools } from './toolsets/apps.js';
import { registerCodeSecurityTools } from './toolsets/code_security.js';
import { registerCodespacesTools } from './toolsets/codespaces.js';
import { registerCopilotTools } from './toolsets/copilot.js';
import { registerGistsTools } from './toolsets/gists.js';
import { registerIssuesTools } from './toolsets/issues.js';
import { registerMiscTools } from './toolsets/misc.js';
import { registerOrgsTeamsTools } from './toolsets/orgs_teams.js';
import { registerPackagesTools } from './toolsets/packages.js';
import { registerProjectsTools } from './toolsets/projects.js';
import { registerPullRequestsTools } from './toolsets/pull_requests.js';
import { registerReposTools } from './toolsets/repos.js';
import { registerSearchTools } from './toolsets/search.js';
import { registerUsersTools } from './toolsets/users.js';

const SERVER_NAME = 'github-mcp-server-js';
const SERVER_VERSION = '0.1.0';

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…(+${s.length - max} more)` : s;
}

function wrapWithLogging(server: McpServer, logger: Logger): void {
  const original = server.registerTool.bind(server) as (
    ...args: unknown[]
  ) => unknown;
  (server as unknown as { registerTool: (...args: unknown[]) => unknown }).registerTool = (
    name: unknown,
    config: unknown,
    cb: unknown,
  ) => {
    const toolName = String(name);
    const handler = cb as (args: unknown, extra?: unknown) => Promise<unknown>;
    const wrapped = async (args: unknown, extra?: unknown): Promise<unknown> => {
      const start = Date.now();
      const argsText = truncate(JSON.stringify(args ?? {}), 200);
      logger.info('tool_call', { name: toolName, args: argsText });
      const result = (await handler(args, extra)) as {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
      const ms = Date.now() - start;
      const preview = truncate(String(result?.content?.[0]?.text ?? ''), 200);
      if (result?.isError) {
        logger.error('tool_error', { name: toolName, ms, message: preview });
      } else {
        logger.info('tool_ok', { name: toolName, ms, result: preview });
      }
      return result;
    };
    return original(name, config, wrapped);
  };
}

export function buildServer(
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
  logger?: Logger,
): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  if (logger) {
    wrapWithLogging(server, logger);
  }

  registerReposTools(server, octokit, permission);
  registerIssuesTools(server, octokit, permission);
  registerPullRequestsTools(server, octokit, permission);
  registerSearchTools(server, octokit, permission);
  registerUsersTools(server, octokit, permission);
  registerGistsTools(server, octokit, permission);
  registerActivityTools(server, octokit, permission);
  registerPackagesTools(server, octokit, permission);
  registerMiscTools(server, octokit, permission);
  registerAppsTools(server, octokit, permission);
  registerCopilotTools(server, octokit, permission);
  registerOrgsTeamsTools(server, octokit, permission);
  registerCodespacesTools(server, octokit, permission);
  registerProjectsTools(server, octokit, permission);
  registerCodeSecurityTools(server, octokit, permission);
  registerActionsTools(server, octokit, permission);

  return server;
}
