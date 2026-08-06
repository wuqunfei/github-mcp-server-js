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
        'List gists for the authenticated user. Returns an array of base-gist objects including id, description, public flag, file list (names and metadata, but not full content), and owner. Paginate with page and per_page. To get full file content for a specific gist, call get_gist with its id. Docs: https://docs.github.com/en/rest/gists/gists#list-gists-for-the-authenticated-user',
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
        'Get a single gist by its id. Returns a gist-simple object with full file content, description, public flag, owner, forks_url, commits_url, and history. File content is included inline (up to the truncation threshold — very large files include a raw_url instead). Docs: https://docs.github.com/en/rest/gists/gists#get-a-gist',
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
    server.registerTool(
      'create_gist',
      {
        description:
          'Create a new gist. A gist is a shareable snippet or small file. Supply one or more files with their content; each file key is the filename (including extension). Set public to true to make the gist visible to all GitHub users, or false (default) for a secret gist (unlisted but accessible by direct URL). Docs: https://docs.github.com/en/rest/gists/gists#create-a-gist',
        inputSchema: z.object({
          files: z
            .record(
              z.string(),
              z.object({
                content: z.string().describe('File content.'),
              }),
            )
            .describe(
              'Files that make up the gist. Each key is the filename (e.g. "hello.rb") and each value is an object with a content field.',
            ),
          description: z.string().optional().describe('Description of the gist.'),
          public: z
            .boolean()
            .optional()
            .describe('Whether the gist is public (true) or secret (false, default).'),
        }),
      },
      async ({ files, description, public: isPublic }) => {
        try {
          const response = await octokit.rest.gists.create({
            files,
            description,
            public: isPublic,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'update_gist',
      {
        description:
          'Update an existing gist. You can change the description and/or update, rename, or delete individual files. To update a file, supply its current filename as the key with new content or a new filename. To delete a file, supply its current filename as the key with a null value. Files not mentioned in the request are left unchanged. Docs: https://docs.github.com/en/rest/gists/gists#update-a-gist',
        inputSchema: z.object({
          gist_id: z.string().describe('The unique identifier of the gist to update.'),
          description: z.string().optional().describe('New description for the gist.'),
          files: z
            .record(
              z.string(),
              z
                .union([
                  z.object({
                    content: z.string().optional().describe('New file content.'),
                    filename: z
                      .string()
                      .nullable()
                      .optional()
                      .describe('New filename. Set to null to delete the file.'),
                  }),
                  z.null(),
                ])
                .optional(),
            )
            .optional()
            .describe(
              'Files to update. Each key is the current filename. Set a value to null to delete that file. Omit a file to leave it unchanged.',
            ),
        }),
      },
      async ({ gist_id, description, files }) => {
        try {
          const response = await octokit.rest.gists.update({
            gist_id,
            description,
            files: files as never,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'delete_gist',
      {
        description: 'Delete a gist. This action is permanent and cannot be undone. Only the gist owner can delete it. Docs: https://docs.github.com/en/rest/gists/gists#delete-a-gist',
        inputSchema: z.object({
          gist_id: z.string().describe('The unique identifier of the gist to delete.'),
        }),
      },
      async ({ gist_id }) => {
        try {
          await octokit.rest.gists.delete({ gist_id });
          return toToolResult({ deleted: true });
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
}
