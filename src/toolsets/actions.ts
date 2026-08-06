import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, toToolResult, toToolError } from './common.js';

const workflowIdSchema = {
  workflow_id: z
    .union([z.number().int(), z.string()])
    .describe('Workflow ID (number) or file name (e.g. "ci.yml").'),
};

const runIdSchema = {
  run_id: z.number().int().describe('Workflow run ID.'),
};

export function registerActionsTools(
  server: McpServer,
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_workflows',
    {
      description: 'List workflows in a repository.',
      inputSchema: z.object({ ...ownerRepoSchema, ...paginationSchema }),
    },
    async ({ owner, repo, page, per_page }) => {
      try {
        const response = await octokit.rest.actions.listRepoWorkflows({
          owner,
          repo,
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
    'get_workflow',
    {
      description: 'Get a workflow by ID or filename.',
      inputSchema: z.object({ ...ownerRepoSchema, ...workflowIdSchema }),
    },
    async ({ owner, repo, workflow_id }) => {
      try {
        const response = await octokit.rest.actions.getWorkflow({ owner, repo, workflow_id });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_workflow_runs',
    {
      description: 'List runs for a workflow.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...workflowIdSchema,
        actor: z.string().optional(),
        branch: z.string().optional(),
        event: z.string().optional(),
        status: z
          .enum([
            'completed',
            'action_required',
            'cancelled',
            'failure',
            'neutral',
            'skipped',
            'stale',
            'success',
            'timed_out',
            'in_progress',
            'queued',
            'requested',
            'waiting',
            'pending',
          ])
          .optional(),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, workflow_id, actor, branch, event, status, page, per_page }) => {
      try {
        const response = await octokit.rest.actions.listWorkflowRuns({
          owner,
          repo,
          workflow_id,
          actor,
          branch,
          event,
          status,
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
    'get_workflow_run',
    {
      description: 'Get a workflow run by ID.',
      inputSchema: z.object({ ...ownerRepoSchema, ...runIdSchema }),
    },
    async ({ owner, repo, run_id }) => {
      try {
        const response = await octokit.rest.actions.getWorkflowRun({ owner, repo, run_id });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_workflow_run_jobs',
    {
      description: 'List jobs for a workflow run.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...runIdSchema,
        filter: z.enum(['latest', 'all']).optional(),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, run_id, filter, page, per_page }) => {
      try {
        const response = await octokit.rest.actions.listJobsForWorkflowRun({
          owner,
          repo,
          run_id,
          filter,
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
    'list_workflow_run_artifacts',
    {
      description: 'List artifacts produced by a workflow run.',
      inputSchema: z.object({ ...ownerRepoSchema, ...runIdSchema, ...paginationSchema }),
    },
    async ({ owner, repo, run_id, page, per_page }) => {
      try {
        const response = await octokit.rest.actions.listWorkflowRunArtifacts({
          owner,
          repo,
          run_id,
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
    'list_check_runs_for_ref',
    {
      description: 'List check runs for a Git ref (SHA, branch, or tag).',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ref: z.string().describe('SHA, branch, or tag to list check runs for.'),
        check_name: z.string().optional(),
        status: z.enum(['queued', 'in_progress', 'completed']).optional(),
        filter: z.enum(['latest', 'all']).optional(),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, ref, check_name, status, filter, page, per_page }) => {
      try {
        const response = await octokit.rest.checks.listForRef({
          owner,
          repo,
          ref,
          check_name,
          status,
          filter,
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
      'run_workflow',
      {
        description: 'Trigger a workflow_dispatch event for a workflow.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          ...workflowIdSchema,
          ref: z.string().describe('Git ref (branch or tag) to run the workflow on.'),
          inputs: z
            .record(z.string(), z.unknown())
            .optional()
            .describe('Workflow inputs (max 10 keys).'),
        }),
      },
      async ({ owner, repo, workflow_id, ref, inputs }) => {
        try {
          await octokit.rest.actions.createWorkflowDispatch({
            owner,
            repo,
            workflow_id,
            ref,
            inputs,
          });
          return toToolResult({ triggered: true });
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'cancel_workflow_run',
      {
        description: 'Cancel a workflow run.',
        inputSchema: z.object({ ...ownerRepoSchema, ...runIdSchema }),
      },
      async ({ owner, repo, run_id }) => {
        try {
          await octokit.rest.actions.cancelWorkflowRun({ owner, repo, run_id });
          return toToolResult({ cancelled: true });
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'rerun_workflow_run',
      {
        description: 'Re-run a workflow run.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          ...runIdSchema,
          enable_debug_logging: z.boolean().optional(),
        }),
      },
      async ({ owner, repo, run_id, enable_debug_logging }) => {
        try {
          await octokit.rest.actions.reRunWorkflow({
            owner,
            repo,
            run_id,
            enable_debug_logging,
          });
          return toToolResult({ rerun_started: true });
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'rerun_workflow_run_failed_jobs',
      {
        description: 'Re-run only the failed jobs in a workflow run.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          ...runIdSchema,
          enable_debug_logging: z.boolean().optional(),
        }),
      },
      async ({ owner, repo, run_id, enable_debug_logging }) => {
        try {
          await octokit.rest.actions.reRunWorkflowFailedJobs({
            owner,
            repo,
            run_id,
            enable_debug_logging,
          });
          return toToolResult({ rerun_started: true });
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'approve_workflow_run',
      {
        description: 'Approve a workflow run that is awaiting fork-PR approval.',
        inputSchema: z.object({ ...ownerRepoSchema, ...runIdSchema }),
      },
      async ({ owner, repo, run_id }) => {
        try {
          await octokit.rest.actions.approveWorkflowRun({ owner, repo, run_id });
          return toToolResult({ approved: true });
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
}
