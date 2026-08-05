import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, toToolResult, toToolError } from './common.js';

export function registerIssuesTools(
  server: McpServer,
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
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

  if (permission === 'read-write') {
    server.registerTool(
      'create_issue',
      {
        description: 'Create a new issue in a GitHub repository.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          title: z.string().describe('Issue title'),
          body: z.string().optional().describe('Issue body/description'),
          assignees: z.array(z.string()).optional().describe('Logins to assign to the issue'),
          labels: z.array(z.string()).optional().describe('Label names to apply to the issue'),
        }),
      },
      async ({ owner, repo, title, body, assignees, labels }) => {
        try {
          const response = await octokit.rest.issues.create({
            owner,
            repo,
            title,
            body,
            assignees,
            labels,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'update_issue',
      {
        description: 'Update an existing issue in a GitHub repository.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          issue_number: z.number().int().describe('Issue number'),
          title: z.string().optional().describe('New issue title'),
          body: z.string().optional().describe('New issue body/description'),
          state: z.enum(['open', 'closed']).optional().describe('New issue state'),
          state_reason: z
            .enum(['completed', 'not_planned', 'duplicate', 'reopened'])
            .optional()
            .describe('Reason for the state change, only applied when state is changed'),
          assignees: z.array(z.string()).optional().describe('Logins to assign to the issue'),
          labels: z.array(z.string()).optional().describe('Label names to replace the issue\'s current labels'),
        }),
      },
      async ({ owner, repo, issue_number, title, body, state, state_reason, assignees, labels }) => {
        try {
          const response = await octokit.rest.issues.update({
            owner,
            repo,
            issue_number,
            title,
            body,
            state,
            state_reason,
            assignees,
            labels,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'add_comment',
      {
        description: 'Add a comment to a GitHub issue.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          issue_number: z.number().int().describe('Issue number'),
          body: z.string().describe('Comment body'),
        }),
      },
      async ({ owner, repo, issue_number, body }) => {
        try {
          const response = await octokit.rest.issues.createComment({ owner, repo, issue_number, body });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'add_labels',
      {
        description: "Add labels to a GitHub issue, keeping the issue's existing labels.",
        inputSchema: z.object({
          ...ownerRepoSchema,
          issue_number: z.number().int().describe('Issue number'),
          labels: z.array(z.string()).describe('Label names to add'),
        }),
      },
      async ({ owner, repo, issue_number, labels }) => {
        try {
          const response = await octokit.rest.issues.addLabels({ owner, repo, issue_number, labels });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'remove_label',
      {
        description: 'Remove a single label from a GitHub issue.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          issue_number: z.number().int().describe('Issue number'),
          name: z.string().describe('Name of the label to remove'),
        }),
      },
      async ({ owner, repo, issue_number, name }) => {
        try {
          const response = await octokit.rest.issues.removeLabel({ owner, repo, issue_number, name });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'lock_issue',
      {
        description: 'Lock a GitHub issue conversation to collaborators only.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          issue_number: z.number().int().describe('Issue number'),
          lock_reason: z
            .enum(['off-topic', 'too heated', 'resolved', 'spam'])
            .optional()
            .describe('Reason for locking the conversation'),
        }),
      },
      async ({ owner, repo, issue_number, lock_reason }) => {
        try {
          await octokit.rest.issues.lock({ owner, repo, issue_number, lock_reason });
          return toToolResult({ locked: true });
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'unlock_issue',
      {
        description: 'Unlock a previously locked GitHub issue conversation.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          issue_number: z.number().int().describe('Issue number'),
        }),
      },
      async ({ owner, repo, issue_number }) => {
        try {
          await octokit.rest.issues.unlock({ owner, repo, issue_number });
          return toToolResult({ locked: false });
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
}
