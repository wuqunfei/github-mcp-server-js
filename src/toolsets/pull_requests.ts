import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, pullNumberSchema, toToolResult, toToolError } from './common.js';

export function registerPullRequestsTools(
  server: McpServer,
  octokit: Octokit,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_pull_requests',
    {
      description: 'List pull requests in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        state: z.enum(['open', 'closed', 'all']).optional().describe('Filter by pull request state (defaults to open)'),
        head: z.string().optional().describe('Filter by head user/org and branch, e.g. "octocat:feature-branch"'),
        base: z.string().optional().describe('Filter by base branch name'),
        sort: z
          .enum(['created', 'updated', 'popularity', 'long-running'])
          .optional()
          .describe('Field to sort results by'),
        direction: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, state, head, base, sort, direction, page, per_page }) => {
      try {
        const response = await octokit.rest.pulls.list({
          owner,
          repo,
          state,
          head,
          base,
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
    'get_pull_request',
    {
      description: 'Get a single pull request in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...pullNumberSchema,
      }),
    },
    async ({ owner, repo, pull_number }) => {
      try {
        const response = await octokit.rest.pulls.get({ owner, repo, pull_number });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_pull_request_files',
    {
      description: 'List the files changed in a GitHub pull request.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...pullNumberSchema,
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, pull_number, page, per_page }) => {
      try {
        const response = await octokit.rest.pulls.listFiles({ owner, repo, pull_number, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_pull_request_commits',
    {
      description: 'List the commits on a GitHub pull request.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...pullNumberSchema,
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, pull_number, page, per_page }) => {
      try {
        const response = await octokit.rest.pulls.listCommits({ owner, repo, pull_number, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_pull_request_reviews',
    {
      description: 'List the reviews on a GitHub pull request.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...pullNumberSchema,
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, pull_number, page, per_page }) => {
      try {
        const response = await octokit.rest.pulls.listReviews({ owner, repo, pull_number, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}
