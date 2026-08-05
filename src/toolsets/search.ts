import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolResult, toToolError } from './common.js';

const orderSchema = z
  .enum(['asc', 'desc'])
  .optional()
  .describe('Sort direction. Ignored unless sort is set.');

export function registerSearchTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'search_repos',
    {
      description:
        'Search GitHub repositories via various criteria. The q parameter accepts GitHub search qualifiers (e.g. "tetris language:assembly stars:>100"). Returns up to 100 results per page; GitHub caps total results at 1000.',
      inputSchema: z.object({
        q: z.string().describe('Search query. Accepts GitHub search qualifiers like language:, stars:, forks:, user:, org:, topic:.'),
        sort: z
          .enum(['stars', 'forks', 'help-wanted-issues', 'updated'])
          .optional()
          .describe('Field to sort results by. Defaults to relevance if omitted.'),
        order: orderSchema,
        ...paginationSchema,
      }),
    },
    async ({ q, sort, order, page, per_page }) => {
      try {
        const response = await octokit.rest.search.repos({ q, sort, order, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'search_code',
    {
      description:
        'Search code across GitHub. The q parameter accepts GitHub code-search qualifiers (e.g. "addClass repo:jquery/jquery in:file language:js"). Sort and order are omitted because GitHub is closing down sortable code search; results are ranked by relevance.',
      inputSchema: z.object({
        q: z.string().describe('Search query. Accepts qualifiers like repo:, path:, language:, in:file, in:path.'),
        ...paginationSchema,
      }),
    },
    async ({ q, page, per_page }) => {
      try {
        const response = await octokit.rest.search.code({ q, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'search_commits',
    {
      description:
        'Search commits on the default branch of repositories. The q parameter accepts GitHub commit-search qualifiers (e.g. "repo:octocat/Spoon-Knife css author:octocat").',
      inputSchema: z.object({
        q: z.string().describe('Search query. Accepts qualifiers like repo:, author:, committer:, hash:, merge:, is:merge.'),
        sort: z
          .enum(['author-date', 'committer-date'])
          .optional()
          .describe('Field to sort results by. Defaults to relevance if omitted.'),
        order: orderSchema,
        ...paginationSchema,
      }),
    },
    async ({ q, sort, order, page, per_page }) => {
      try {
        const response = await octokit.rest.search.commits({ q, sort, order, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'search_issues',
    {
      description:
        'Search GitHub issues AND pull requests. GitHub treats issues and pull requests as a single searchable resource; scope with is:issue or is:pull-request qualifiers inside q. Example q: "windows label:bug language:python state:open is:issue".',
      inputSchema: z.object({
        q: z.string().describe('Search query. Use is:issue or is:pull-request to scope; accepts qualifiers like label:, language:, state:, author:, assignee:.'),
        sort: z
          .enum([
            'comments',
            'reactions',
            'reactions-+1',
            'reactions--1',
            'reactions-smile',
            'reactions-thinking_face',
            'reactions-heart',
            'reactions-tada',
            'interactions',
            'created',
            'updated',
          ])
          .optional()
          .describe('Field to sort results by. Defaults to relevance if omitted.'),
        order: orderSchema,
        ...paginationSchema,
      }),
    },
    async ({ q, sort, order, page, per_page }) => {
      try {
        const response = await octokit.rest.search.issuesAndPullRequests({
          q,
          sort,
          order,
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
    'search_users',
    {
      description:
        'Search GitHub users. Only returns publicly visible users. The q parameter accepts GitHub user-search qualifiers (e.g. "tom repos:>42 followers:>1000").',
      inputSchema: z.object({
        q: z.string().describe('Search query. Accepts qualifiers like type:user, type:org, repos:, followers:, location:, language:.'),
        sort: z
          .enum(['followers', 'repositories', 'joined'])
          .optional()
          .describe('Field to sort results by. Defaults to relevance if omitted.'),
        order: orderSchema,
        ...paginationSchema,
      }),
    },
    async ({ q, sort, order, page, per_page }) => {
      try {
        const response = await octokit.rest.search.users({ q, sort, order, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}
