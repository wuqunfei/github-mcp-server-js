import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolError, toToolResult } from './common.js';

export function registerGistsTools(
  server: McpServer,
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_gists',
    {
      description:
        'List gists for the authenticated user. Returns an array of base-gist objects including id, description, public flag, file list (names and metadata, but not full content), and owner. Paginate with page and per_page. To get full file content for a specific gist, call get_gist with its id.',
      inputSchema: z.object({
        since: z
          .string()
          .optional()
          .describe(
            'ISO 8601 timestamp (YYYY-MM-DDTHH:MM:SSZ). Only return gists updated at or after this time.',
          ),
        ...paginationSchema,
      }),
    },
    async ({ since, page, per_page }) => {
      try {
        const response = await octokit.rest.gists.list({ since, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_gist',
    {
      description:
        'Get a single gist by its id. Returns a gist-simple object with full file content, description, public flag, owner, forks_url, commits_url, and history. File content is included inline (up to the truncation threshold — very large files include a raw_url instead).',
      inputSchema: z.object({
        gist_id: z.string().describe('The unique identifier of the gist.'),
      }),
    },
    async ({ gist_id }) => {
      try {
        const response = await octokit.rest.gists.get({ gist_id });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  if (permission === 'read-write') {
    // Write tools added in Task 2.
  }
}
