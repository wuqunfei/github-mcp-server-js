import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
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

export function buildServer(
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

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
