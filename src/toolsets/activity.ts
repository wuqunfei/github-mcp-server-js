import type { McpServer } from '@modelcontextprotocol/server';
import type { RequestError } from '@octokit/request-error';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, toToolError, toToolResult } from './common.js';

export function registerActivityTools(
  server: McpServer,
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_notifications',
    {
      description:
        'List notifications for the authenticated user. Returns an array of thread objects representing unread (or all) notifications. Each thread includes the subject (title, type, URL), repository, reason, and updated_at timestamp. Use all=true to include already-read notifications. Paginate with page and per_page (max 50 per page — GitHub caps this endpoint at 50, not the usual 100).',
      inputSchema: z.object({
        all: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'If true, return all notifications including already-read ones. If false (default), return only unread notifications.',
          ),
        participating: z
          .boolean()
          .optional()
          .describe(
            'If true, return only notifications in which the authenticated user is directly participating or mentioned.',
          ),
        since: z
          .string()
          .optional()
          .describe(
            'Only show notifications updated after the given time. ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ.',
          ),
        before: z
          .string()
          .optional()
          .describe(
            'Only show notifications updated before the given time. ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ.',
          ),
        page: z.number().int().min(1).default(1),
        per_page: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(30)
          .describe('Number of results per page. Maximum 50 (GitHub cap for this endpoint).'),
      }),
    },
    async ({ all, participating, since, before, page, per_page }) => {
      try {
        const response = await octokit.rest.activity.listNotificationsForAuthenticatedUser({
          all,
          participating,
          since,
          before,
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
    'list_starred_repos',
    {
      description:
        'List repositories starred by the authenticated user. Returns an array of repository objects including id, name, full_name, html_url, description, stargazers_count, language, and owner. Sort by created (when the user starred it) or updated (when the repo was last pushed to). Paginate with page and per_page.',
      inputSchema: z.object({
        sort: z
          .enum(['created', 'updated'])
          .optional()
          .describe(
            'Sort starred repositories by created (date the authenticated user starred the repo, default) or updated (date the repo was last pushed to).',
          ),
        direction: z
          .enum(['asc', 'desc'])
          .optional()
          .describe('Sort direction: asc or desc. Default is desc.'),
        ...paginationSchema,
      }),
    },
    async ({ sort, direction, page, per_page }) => {
      try {
        const response = await octokit.rest.activity.listReposStarredByAuthenticatedUser({
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
    'check_repo_starred',
    {
      description:
        'Check whether the authenticated user has starred a given repository. Returns { starred: true } if the repository is starred, or { starred: false } if it is not. Never returns an error for a 404 (not-starred) response — only errors on authentication failures (401/403) or truly unexpected conditions.',
      inputSchema: z.object({
        ...ownerRepoSchema,
      }),
    },
    async ({ owner, repo }) => {
      try {
        await octokit.rest.activity.checkRepoIsStarredByAuthenticatedUser({ owner, repo });
        return toToolResult({ starred: true });
      } catch (error) {
        const reqError = error as RequestError;
        if (reqError.status === 404) {
          return toToolResult({ starred: false });
        }
        return toToolError(error);
      }
    },
  );

  if (permission === 'read-write') {
    server.registerTool(
      'star_repo',
      {
        description:
          'Star a repository on behalf of the authenticated user. Starring marks a repository as interesting and adds it to the authenticated user\'s starred list (visible via list_starred_repos). Returns { starred: true } on success. Returns an error if the repository does not exist or the token lacks sufficient scope.',
        inputSchema: z.object({
          ...ownerRepoSchema,
        }),
      },
      async ({ owner, repo }) => {
        try {
          await octokit.rest.activity.starRepoForAuthenticatedUser({ owner, repo });
          return toToolResult({ starred: true });
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'unstar_repo',
      {
        description:
          'Unstar a repository that the authenticated user has previously starred. Removes the repository from the authenticated user\'s starred list. Returns { starred: false } on success. This is a no-op if the repository was not already starred (GitHub returns 204 either way), so the result is always { starred: false } on a 204 response.',
        inputSchema: z.object({
          ...ownerRepoSchema,
        }),
      },
      async ({ owner, repo }) => {
        try {
          await octokit.rest.activity.unstarRepoForAuthenticatedUser({ owner, repo });
          return toToolResult({ starred: false });
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
}
