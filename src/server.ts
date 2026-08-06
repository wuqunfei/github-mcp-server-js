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

// Emit a raw `notifications/message` via ctx.mcpReq.notify so MCP clients
// (Claude Desktop) receive the structured `data` field as the "metadata"
// shown alongside each log line — instead of the raw stderr text which the
// client can only show with { metadata: undefined }.
//
// We use notify() rather than the higher-level ctx.mcpReq.log() because
// log() silently drops notifications until the client calls
// `logging/setLevel` first, and Claude Desktop doesn't send it. notify()
// bypasses that filter and always sends the wire notification.
//
// Silently no-ops if ctx doesn't expose notify() (unit tests, non-MCP
// invocations). Failures are swallowed so a broken log channel never
// breaks the tool call.
async function mcpLog(
  ctx: unknown,
  level: 'debug' | 'info' | 'error',
  data: Record<string, unknown>,
): Promise<void> {
  const notify = (
    ctx as {
      mcpReq?: {
        notify?: (n: {
          method: string;
          params: Record<string, unknown>;
        }) => Promise<void>;
      };
    }
  )?.mcpReq?.notify;
  if (typeof notify !== 'function') return;
  try {
    await notify({
      method: 'notifications/message',
      params: { level, data, logger: SERVER_NAME },
    });
  } catch {
    // MCP log failures must not break the tool call.
  }
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
      const callFields = { name: toolName, args: argsText };
      logger.info('tool_call', callFields);
      await mcpLog(extra, 'info', { event: 'tool_call', ...callFields });

      const result = (await handler(args, extra)) as {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
      const ms = Date.now() - start;
      const preview = truncate(String(result?.content?.[0]?.text ?? ''), 200);
      if (result?.isError) {
        const errFields = { name: toolName, ms, message: preview };
        logger.error('tool_error', errFields);
        await mcpLog(extra, 'error', { event: 'tool_error', ...errFields });
      } else {
        const okFields = { name: toolName, ms, result: preview };
        logger.info('tool_ok', okFields);
        await mcpLog(extra, 'info', { event: 'tool_ok', ...okFields });
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
  // Declare the `logging` capability so MCP clients (Claude Desktop) accept
  // `notifications/message` sent from ctx.mcpReq.log inside the wrap below.
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { logging: {} } },
  );

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
