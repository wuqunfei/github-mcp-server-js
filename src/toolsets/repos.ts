import type { McpServer } from '@modelcontextprotocol/server';
import type { RequestError } from '@octokit/request-error';
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
      description: 'Get a GitHub repository by owner and name. Docs: https://docs.github.com/en/rest/repos/repos#get-a-repository',
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
      description: 'List branches in a GitHub repository. Docs: https://docs.github.com/en/rest/branches/branches#list-branches',
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
      description: 'Get a single branch in a GitHub repository. Docs: https://docs.github.com/en/rest/branches/branches#get-a-branch',
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
      description: 'Get the contents of a file or directory in a GitHub repository. Docs: https://docs.github.com/en/rest/repos/contents#get-repository-content',
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
      description: 'List commits in a GitHub repository. Docs: https://docs.github.com/en/rest/commits/commits#list-commits',
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
      description: 'Get a single commit in a GitHub repository. Docs: https://docs.github.com/en/rest/commits/commits#get-a-commit',
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
      description: 'List tags in a GitHub repository. Docs: https://docs.github.com/en/rest/repos/repos#list-repository-tags',
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

  server.registerTool(
    'get_tree',
    {
      description:
        'Get a single tree in a GitHub repository using the SHA1 value or ref name for that tree. Docs: https://docs.github.com/en/rest/git/trees#get-a-tree',
      inputSchema: z.object({
        ...ownerRepoSchema,
        tree_sha: z.string().describe('SHA1 value or ref (branch/tag) name of the tree'),
        recursive: z
          .boolean()
          .optional()
          .describe('If true, recursively return all objects/subtrees referenced by the tree'),
      }),
    },
    async ({ owner, repo, tree_sha, recursive }) => {
      try {
        const response = await octokit.rest.git.getTree({
          owner,
          repo,
          tree_sha,
          recursive: recursive ? 'true' : undefined,
        });
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
        description: 'Create a new file or update an existing file in a GitHub repository. Docs: https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents',
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

    server.registerTool(
      'create_branch',
      {
        description:
          'Create a new branch in a GitHub repository from an existing branch or commit SHA. Docs: https://docs.github.com/en/rest/git/refs#create-a-reference',
        inputSchema: z.object({
          ...ownerRepoSchema,
          branch: z.string().describe('Name for the new branch (without the refs/heads/ prefix)'),
          from: z.string().describe('Source branch name or commit SHA to create the new branch from'),
        }),
      },
      async ({ owner, repo, branch, from }) => {
        try {
          let sha: string;
          try {
            const branchResponse = await octokit.rest.repos.getBranch({ owner, repo, branch: from });
            sha = branchResponse.data.commit.sha;
          } catch (error) {
            const reqError = error as RequestError;
            if (reqError.status !== 404) {
              throw error;
            }
            sha = from;
          }

          const response = await octokit.rest.git.createRef({
            owner,
            repo,
            ref: `refs/heads/${branch}`,
            sha,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'delete_branch',
      {
        description:
          'Delete a branch from a GitHub repository. This action is permanent and cannot be undone. Docs: https://docs.github.com/en/rest/git/refs#delete-a-reference',
        inputSchema: z.object({
          ...ownerRepoSchema,
          branch: z.string().describe('Name of the branch to delete (without the refs/heads/ prefix)'),
        }),
      },
      async ({ owner, repo, branch }) => {
        try {
          await octokit.rest.git.deleteRef({ owner, repo, ref: `heads/${branch}` });
          return toToolResult({ deleted: true });
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'create_tree',
      {
        description:
          'Create a new tree object in a GitHub repository from a set of tree entries, optionally based on an existing tree. Docs: https://docs.github.com/en/rest/git/trees#create-a-tree',
        inputSchema: z.object({
          ...ownerRepoSchema,
          tree: z
            .array(
              z
                .object({
                  path: z.string().describe('File referenced in the tree'),
                  mode: z
                    .enum(['100644', '100755', '040000', '160000', '120000'])
                    .describe(
                      'File mode: 100644 (file), 100755 (executable), 040000 (subdirectory), 160000 (submodule), 120000 (symlink)',
                    ),
                  type: z.enum(['blob', 'tree', 'commit']).describe('Type of the tree entry'),
                  sha: z
                    .string()
                    .nullable()
                    .optional()
                    .describe(
                      'SHA1 of the object to place at this path; set to null to delete this path from base_tree',
                    ),
                  content: z
                    .string()
                    .optional()
                    .describe('Content for this file; GitHub creates the blob. Use either this or sha, not both'),
                })
                .refine((entry) => entry.sha !== undefined || entry.content !== undefined, {
                  message: 'Each tree entry must include either sha or content',
                }),
            )
            .describe('Tree entries specifying the new tree structure'),
          base_tree: z
            .string()
            .optional()
            .describe('SHA of an existing tree to use as the base for the new tree'),
        }),
      },
      async ({ owner, repo, tree, base_tree }) => {
        try {
          const response = await octokit.rest.git.createTree({ owner, repo, tree, base_tree });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
}
