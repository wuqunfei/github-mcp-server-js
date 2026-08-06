import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolResult, toToolError } from './common.js';

const orgSchema = {
  org: z.string().describe('Organization login (e.g. "acme")'),
};

const teamSlugSchema = {
  team_slug: z.string().describe('Team slug (URL-friendly name; e.g. "engineering")'),
};

const usernameSchema = {
  username: z.string().describe('GitHub username (login)'),
};

export function registerOrgsTeamsTools(
  server: McpServer,
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'get_org',
    {
      description: 'Get a GitHub organization by login. Docs: https://docs.github.com/en/rest/orgs/orgs#get-an-organization',
      inputSchema: z.object({ ...orgSchema }),
    },
    async ({ org }) => {
      try {
        const response = await octokit.rest.orgs.get({ org });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_org_members',
    {
      description: 'List members of a GitHub organization. Docs: https://docs.github.com/en/rest/orgs/members#list-organization-members',
      inputSchema: z.object({
        ...orgSchema,
        filter: z
          .enum(['2fa_disabled', '2fa_insecure', 'all'])
          .optional()
          .describe('Filter members (2fa_disabled/2fa_insecure only visible to org owners).'),
        role: z.enum(['all', 'admin', 'member']).optional().describe('Filter by role.'),
        ...paginationSchema,
      }),
    },
    async ({ org, filter, role, page, per_page }) => {
      try {
        const response = await octokit.rest.orgs.listMembers({
          org,
          filter,
          role,
          page,
          per_page,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_org_repos',
    {
      description: 'List repositories in a GitHub organization. Docs: https://docs.github.com/en/rest/repos/repos#list-organization-repositories',
      inputSchema: z.object({
        ...orgSchema,
        type: z
          .enum(['all', 'public', 'private', 'forks', 'sources', 'member'])
          .optional()
          .describe('Type of repositories to list.'),
        sort: z
          .enum(['created', 'updated', 'pushed', 'full_name'])
          .optional()
          .describe('Field to sort by.'),
        direction: z.enum(['asc', 'desc']).optional().describe('Sort direction.'),
        ...paginationSchema,
      }),
    },
    async ({ org, type, sort, direction, page, per_page }) => {
      try {
        const response = await octokit.rest.repos.listForOrg({
          org,
          type,
          sort,
          direction,
          page,
          per_page,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_teams',
    {
      description: 'List teams in a GitHub organization. Docs: https://docs.github.com/en/rest/teams/teams#list-teams',
      inputSchema: z.object({
        ...orgSchema,
        ...paginationSchema,
      }),
    },
    async ({ org, page, per_page }) => {
      try {
        const response = await octokit.rest.teams.list({ org, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_team_by_name',
    {
      description: 'Get a GitHub team by its slug within an organization. Docs: https://docs.github.com/en/rest/teams/teams#get-a-team-by-name',
      inputSchema: z.object({
        ...orgSchema,
        ...teamSlugSchema,
      }),
    },
    async ({ org, team_slug }) => {
      try {
        const response = await octokit.rest.teams.getByName({ org, team_slug });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_team_members',
    {
      description: 'List the members of a GitHub team. Docs: https://docs.github.com/en/rest/teams/members#list-team-members',
      inputSchema: z.object({
        ...orgSchema,
        ...teamSlugSchema,
        role: z.enum(['member', 'maintainer', 'all']).optional().describe('Filter by team role.'),
        ...paginationSchema,
      }),
    },
    async ({ org, team_slug, role, page, per_page }) => {
      try {
        const response = await octokit.rest.teams.listMembersInOrg({
          org,
          team_slug,
          role,
          page,
          per_page,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  if (permission === 'read-write') {
    server.registerTool(
      'add_or_update_team_membership',
      {
        description:
          'Add a user to a team or update their team role. Requires org-owner or team-maintainer permission. Docs: https://docs.github.com/en/rest/teams/members#add-or-update-team-membership-for-a-user',
        inputSchema: z.object({
          ...orgSchema,
          ...teamSlugSchema,
          ...usernameSchema,
          role: z
            .enum(['member', 'maintainer'])
            .optional()
            .describe('Role to grant (defaults to "member").'),
        }),
      },
      async ({ org, team_slug, username, role }) => {
        try {
          const response = await octokit.rest.teams.addOrUpdateMembershipForUserInOrg({
            org,
            team_slug,
            username,
            role,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'remove_team_membership',
      {
        description:
          'Remove a user from a team. Does not delete the user, only their team membership. Requires org-owner or team-admin permission. Docs: https://docs.github.com/en/rest/teams/members#remove-team-membership-for-a-user',
        inputSchema: z.object({
          ...orgSchema,
          ...teamSlugSchema,
          ...usernameSchema,
        }),
      },
      async ({ org, team_slug, username }) => {
        try {
          await octokit.rest.teams.removeMembershipForUserInOrg({ org, team_slug, username });
          return toToolResult({ removed: true });
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
}
