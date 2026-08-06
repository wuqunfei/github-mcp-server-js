import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolResult, toToolError } from './common.js';

export function registerUsersTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'get_user_by_username',
    {
      description:
        'Get publicly available information about a GitHub user by their login (username). Returns profile data including name, bio, location, public repo count, follower count, and following count. Returns a 404 if the user does not exist or is an Enterprise Managed User not visible to the caller. Docs: https://docs.github.com/en/rest/users/users#get-a-user',
      inputSchema: z.object({
        username: z.string().describe('The GitHub username (login) of the user to look up.'),
      }),
    },
    async ({ username }) => {
      try {
        const response = await octokit.rest.users.getByUsername({ username });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_authenticated_user',
    {
      description:
        'Get the profile of the currently authenticated user (the owner of the GITHUB_TOKEN in use). Returns the same public fields as get_user_by_username plus private fields (private_gists, total_private_repos, plan, etc.) that are visible only to the token owner, subject to token scope. Docs: https://docs.github.com/en/rest/users/users#get-the-authenticated-user',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const response = await octokit.rest.users.getAuthenticated();
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_user_followers',
    {
      description:
        'List the users who follow a given GitHub user. Returns an array of simple-user objects, each with login, id, avatar_url, and html_url. Paginate with page and per_page. Docs: https://docs.github.com/en/rest/users/followers#list-followers-of-a-user',
      inputSchema: z.object({
        username: z.string().describe('The GitHub username (login) whose followers to list.'),
        ...paginationSchema,
      }),
    },
    async ({ username, page, per_page }) => {
      try {
        const response = await octokit.rest.users.listFollowersForUser({
          username,
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
    'list_user_following',
    {
      description:
        'List the users that a given GitHub user follows. Returns an array of simple-user objects, each with login, id, avatar_url, and html_url. Paginate with page and per_page. Docs: https://docs.github.com/en/rest/users/followers#list-the-people-a-user-follows',
      inputSchema: z.object({
        username: z.string().describe('The GitHub username (login) whose following list to retrieve.'),
        ...paginationSchema,
      }),
    },
    async ({ username, page, per_page }) => {
      try {
        const response = await octokit.rest.users.listFollowingForUser({
          username,
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
    'get_user_hovercard',
    {
      description:
        'Get contextual information about a GitHub user (their "hovercard") as it would appear in the GitHub web UI. Returns a list of context messages (e.g. "Owns this repository", "Contributor"). Optionally scope the context to a specific subject (a repository, issue, pull request, or organization) by providing subject_type and subject_id together — both are required when either is supplied. Docs: https://docs.github.com/en/rest/users/users#get-contextual-information-for-a-user',
      inputSchema: z.object({
        username: z.string().describe('The GitHub username (login) to get hovercard context for.'),
        subject_type: z
          .enum(['organization', 'repository', 'issue', 'pull_request'])
          .optional()
          .describe(
            'The entity type that provides the context. Must be paired with subject_id. One of: organization, repository, issue, pull_request.',
          ),
        subject_id: z
          .string()
          .optional()
          .describe(
            'The numeric ID (as a string) of the subject_type entity. Required when subject_type is set.',
          ),
      }),
    },
    async ({ username, subject_type, subject_id }) => {
      try {
        const response = await octokit.rest.users.getContextForUser({
          username,
          subject_type,
          subject_id,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}
