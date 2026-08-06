import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolError, toToolResult } from './common.js';

export function registerAppsTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  // ── get_app ────────────────────────────────────────────────────────────────

  server.registerTool(
    'get_app',
    {
      description:
        'Get public metadata for a GitHub App by its URL slug.' +
        'Returns the app\'s id, name, description, owner, external URL, ' +
        'permissions, subscribed events, and installation count. ' +
        'Does not require authentication — the app must be publicly listed. ' +
        'The slug is the URL-friendly name visible in github.com/apps/<slug>.  Docs: https://docs.github.com/en/rest/apps/apps#get-an-app',
      inputSchema: z.object({
        app_slug: z
          .string()
          .describe(
            'The URL slug of the GitHub App (the last segment of its github.com/apps/<slug> URL). ' +
              'For example, for https://github.com/apps/my-cool-app the slug is "my-cool-app".',
          ),
      }),
    },
    async ({ app_slug }) => {
      try {
        const response = await octokit.rest.apps.getBySlug({ app_slug });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  // ── list_installations_for_authenticated_user ──────────────────────────────

  server.registerTool(
    'list_installations_for_authenticated_user',
    {
      description:
        'List GitHub App installations accessible to the authenticated user.' +
        'Returns installations on the user\'s personal account and on organizations ' +
        'where the user is a member, along with the permissions and events each installation subscribes to. ' +
        'Useful for discovering which apps are installed and their installation IDs ' +
        '(needed for list_installation_repos_for_authenticated_user). ' +
        'Requires a token with read:user scope or higher. ' +
        'Paginate with page and per_page.  Docs: https://docs.github.com/en/rest/apps/installations#list-app-installations-accessible-to-the-user-access-token',
      inputSchema: z.object({
        ...paginationSchema,
      }),
    },
    async ({ page, per_page }) => {
      try {
        const response = await octokit.rest.apps.listInstallationsForAuthenticatedUser({
          page,
          per_page,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  // ── list_installation_repos_for_authenticated_user ─────────────────────────

  server.registerTool(
    'list_installation_repos_for_authenticated_user',
    {
      description:
        'List repositories that the authenticated user can access for a specific GitHub App installation.' +
        'Returns repositories where the user has explicit read, write, or admin permission ' +
        'through direct ownership, collaborator access, or organization membership. ' +
        'Use list_installations_for_authenticated_user to discover installation IDs first. ' +
        'Paginate with page and per_page.  Docs: https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-user-access-token',
      inputSchema: z.object({
        installation_id: z
          .number()
          .int()
          .describe(
            'The unique installation ID of the GitHub App installation. ' +
              'Use list_installations_for_authenticated_user to find installation IDs.',
          ),
        ...paginationSchema,
      }),
    },
    async ({ installation_id, page, per_page }) => {
      try {
        const response = await octokit.rest.apps.listInstallationReposForAuthenticatedUser({
          installation_id,
          page,
          per_page,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}
