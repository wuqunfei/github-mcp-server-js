import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, toToolResult, toToolError } from './common.js';

export function registerIssuesTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_issues',
    {
      description: 'List issues in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        state: z.enum(['open', 'closed', 'all']).optional().describe('Filter by issue state (defaults to open)'),
        labels: z.string().optional().describe('Comma-separated list of label names to filter by'),
        assignee: z.string().optional().describe('Filter by assignee login, "none", or "*" for any'),
        sort: z.enum(['created', 'updated', 'comments']).optional().describe('Field to sort results by'),
        direction: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, state, labels, assignee, sort, direction, page, per_page }) => {
      try {
        const response = await octokit.rest.issues.listForRepo({
          owner,
          repo,
          state,
          labels,
          assignee,
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
    'get_issue',
    {
      description: 'Get a single issue in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        issue_number: z.number().int().describe('Issue number'),
      }),
    },
    async ({ owner, repo, issue_number }) => {
      try {
        const response = await octokit.rest.issues.get({ owner, repo, issue_number });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_comments',
    {
      description: 'List comments on a GitHub issue.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        issue_number: z.number().int().describe('Issue number'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, issue_number, page, per_page }) => {
      try {
        const response = await octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number,
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
    'list_labels',
    {
      description: 'List all labels defined in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, page, per_page }) => {
      try {
        const response = await octokit.rest.issues.listLabelsForRepo({ owner, repo, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_labels_on_issue',
    {
      description: 'List the labels currently applied to a GitHub issue.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        issue_number: z.number().int().describe('Issue number'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, issue_number, page, per_page }) => {
      try {
        const response = await octokit.rest.issues.listLabelsOnIssue({
          owner,
          repo,
          issue_number,
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
