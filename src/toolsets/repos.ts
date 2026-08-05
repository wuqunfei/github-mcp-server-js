import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, toToolResult, toToolError } from './common.js';

export function registerReposTools(
  server: McpServer,
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'get_repository',
    {
      description: 'Get a GitHub repository by owner and name.',
      inputSchema: z.object({
        ...ownerRepoSchema,
      }),
    },
    async ({ owner, repo }) => {
      try {
        const response = await octokit.rest.repos.get({ owner, repo });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_branches',
    {
      description: 'List branches in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, page, per_page }) => {
      try {
        const response = await octokit.rest.repos.listBranches({ owner, repo, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_branch',
    {
      description: 'Get a single branch in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        branch: z.string().describe('Branch name'),
      }),
    },
    async ({ owner, repo, branch }) => {
      try {
        const response = await octokit.rest.repos.getBranch({ owner, repo, branch });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_file_contents',
    {
      description: 'Get the contents of a file or directory in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        path: z.string().describe('Path to the file or directory'),
        ref: z.string().optional().describe('Branch, tag, or commit SHA (defaults to the default branch)'),
      }),
    },
    async ({ owner, repo, path, ref }) => {
      try {
        const response = await octokit.rest.repos.getContent({ owner, repo, path, ref });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_commits',
    {
      description: 'List commits in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        sha: z.string().optional().describe('SHA or branch to list commits from'),
        path: z.string().optional().describe('Only commits touching this file path'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, sha, path, page, per_page }) => {
      try {
        const response = await octokit.rest.repos.listCommits({
          owner,
          repo,
          sha,
          path,
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
    'get_commit',
    {
      description: 'Get a single commit in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ref: z.string().describe('Commit SHA, branch, or tag'),
      }),
    },
    async ({ owner, repo, ref }) => {
      try {
        const response = await octokit.rest.repos.getCommit({ owner, repo, ref });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_tags',
    {
      description: 'List tags in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, page, per_page }) => {
      try {
        const response = await octokit.rest.repos.listTags({ owner, repo, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  if (permission === 'read-write') {
    server.registerTool(
      'create_or_update_file',
      {
        description: 'Create a new file or update an existing file in a GitHub repository.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          path: z.string().describe('Path to the file'),
          message: z.string().describe('Commit message'),
          content: z.string().describe('New file content, Base64-encoded'),
          sha: z
            .string()
            .optional()
            .describe('Blob SHA of the file being replaced, required when updating an existing file'),
          branch: z.string().optional().describe('Branch to commit to (defaults to the default branch)'),
        }),
      },
      async ({ owner, repo, path, message, content, sha, branch }) => {
        try {
          const response = await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message,
            content,
            sha,
            branch,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
}
