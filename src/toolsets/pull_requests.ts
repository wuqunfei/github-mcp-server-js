import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, pullNumberSchema, toToolResult, toToolError } from './common.js';

export function registerPullRequestsTools(
  server: McpServer,
  octokit: Octokit,
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

  if (permission === 'read-write') {
    server.registerTool(
      'create_pull_request',
      {
        description: 'Create a new pull request in a GitHub repository.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          title: z.string().optional().describe('Pull request title (required unless issue is specified)'),
          head: z.string().describe('Branch containing the changes, e.g. "octocat:feature-branch"'),
          base: z.string().describe('Branch you want the changes pulled into'),
          body: z.string().optional().describe('Pull request body/description'),
          draft: z.boolean().optional().describe('Whether to create the pull request as a draft'),
          maintainer_can_modify: z.boolean().optional().describe('Whether maintainers can modify the pull request'),
          issue: z.number().int().optional().describe('Issue number to convert into a pull request'),
        }),
      },
      async ({ owner, repo, title, head, base, body, draft, maintainer_can_modify, issue }) => {
        try {
          const response = await octokit.rest.pulls.create({
            owner,
            repo,
            title,
            head,
            base,
            body,
            draft,
            maintainer_can_modify,
            issue,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'update_pull_request',
      {
        description: 'Update an existing pull request in a GitHub repository.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          ...pullNumberSchema,
          title: z.string().optional().describe('New pull request title'),
          body: z.string().optional().describe('New pull request body/description'),
          state: z.enum(['open', 'closed']).optional().describe('New pull request state'),
          base: z.string().optional().describe('New base branch name'),
          maintainer_can_modify: z.boolean().optional().describe('Whether maintainers can modify the pull request'),
        }),
      },
      async ({ owner, repo, pull_number, title, body, state, base, maintainer_can_modify }) => {
        try {
          const response = await octokit.rest.pulls.update({
            owner,
            repo,
            pull_number,
            title,
            body,
            state,
            base,
            maintainer_can_modify,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'merge_pull_request',
      {
        description: 'Merge a pull request in a GitHub repository.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          ...pullNumberSchema,
          commit_title: z.string().optional().describe('Title for the automatic merge commit message'),
          commit_message: z.string().optional().describe('Extra detail to append to the automatic merge commit message'),
          sha: z.string().optional().describe('SHA the pull request head must match to allow the merge'),
          merge_method: z.enum(['merge', 'squash', 'rebase']).optional().describe('Merge method to use'),
        }),
      },
      async ({ owner, repo, pull_number, commit_title, commit_message, sha, merge_method }) => {
        try {
          const response = await octokit.rest.pulls.merge({
            owner,
            repo,
            pull_number,
            commit_title,
            commit_message,
            sha,
            merge_method,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'create_pull_request_review',
      {
        description: 'Create a review on a GitHub pull request.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          ...pullNumberSchema,
          commit_id: z.string().optional().describe('SHA of the commit to review (defaults to the most recent commit)'),
          body: z.string().optional().describe('Review body text, required when event is REQUEST_CHANGES or COMMENT'),
          event: z
            .enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT'])
            .optional()
            .describe('Review action; omit to leave the review PENDING'),
        }),
      },
      async ({ owner, repo, pull_number, commit_id, body, event }) => {
        try {
          const response = await octokit.rest.pulls.createReview({
            owner,
            repo,
            pull_number,
            commit_id,
            body,
            event,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'request_reviewers',
      {
        description: 'Request reviewers for a GitHub pull request.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          ...pullNumberSchema,
          reviewers: z.array(z.string()).optional().describe('User logins to request review from'),
          team_reviewers: z.array(z.string()).optional().describe('Team slugs to request review from'),
        }),
      },
      async ({ owner, repo, pull_number, reviewers, team_reviewers }) => {
        try {
          const response = await octokit.rest.pulls.requestReviewers({
            owner,
            repo,
            pull_number,
            reviewers,
            team_reviewers,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
}
