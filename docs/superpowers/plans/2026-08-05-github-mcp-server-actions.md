# github-mcp-server-js — `actions` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkboxes tracked `- [x]` / `- [x]`.

**Goal:** Add the `actions` toolset (12 tools: 7 read for workflow/run/job/artifact/check introspection + 5 write for triggering/canceling/rerunning workflow runs) to `github-mcp-server-js`.

**Architecture:** Same pattern as `issues`/`gists`/`orgs_teams`: single `registerActionsTools(server, octokit, permission): void` function; writes gated behind `if (permission === 'read-write')`; raw JSON passthrough. Cross-namespace: uses `actions.*` and one `checks.listForRef` — the design row lists both under `actions, checks`.

**Tech Stack:** No new dependencies.

## Global Constraints

- 12 tools EXACT. 7 read + 5 write.
- Signature: `registerActionsTools(server, octokit, permission): void`.
- Raw JSON passthrough; errors via `toToolError`.
- Write tools inside `if (permission === 'read-write')`.
- List tools use `paginationSchema`.
- Zero collision with 92 existing tool names (verified: `workflow`/`artifact`/`job`/`check_run` prefixes).
- `run_workflow` (createWorkflowDispatch), `cancel_workflow_run`, `rerun_workflow_run`, `rerun_workflow_run_failed_jobs`, `approve_workflow_run` all return 201/204 with no body — synthesize `{ triggered: true }` / `{ cancelled: true }` / `{ rerun_started: true }` / `{ approved: true }` on success (per lock/unlock/star precedent).
- TypeScript only.

---

## File Structure

```
src/toolsets/actions.ts, test/unit/toolsets/actions.test.ts, src/server.ts, README.md
```

---

## Reference: verified octokit shapes

Confirmed against `octokit.rest.actions.*` / `octokit.rest.checks.*` and `@octokit/openapi-types/types.d.ts`.

| Tool | octokit method | HTTP |
|---|---|---|
| `list_workflows` | `actions.listRepoWorkflows` | GET `/repos/{owner}/{repo}/actions/workflows` |
| `get_workflow` | `actions.getWorkflow` | GET `/repos/{owner}/{repo}/actions/workflows/{workflow_id}` |
| `list_workflow_runs` | `actions.listWorkflowRuns` | GET `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs` |
| `get_workflow_run` | `actions.getWorkflowRun` | GET `/repos/{owner}/{repo}/actions/runs/{run_id}` |
| `list_workflow_run_jobs` | `actions.listJobsForWorkflowRun` | GET `/repos/{owner}/{repo}/actions/runs/{run_id}/jobs` |
| `list_workflow_run_artifacts` | `actions.listWorkflowRunArtifacts` | GET `/repos/{owner}/{repo}/actions/runs/{run_id}/artifacts` |
| `list_check_runs_for_ref` | `checks.listForRef` | GET `/repos/{owner}/{repo}/commits/{ref}/check-runs` |
| `run_workflow` | `actions.createWorkflowDispatch` | POST `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` |
| `cancel_workflow_run` | `actions.cancelWorkflowRun` | POST `/repos/{owner}/{repo}/actions/runs/{run_id}/cancel` |
| `rerun_workflow_run` | `actions.reRunWorkflow` | POST `/repos/{owner}/{repo}/actions/runs/{run_id}/rerun` |
| `rerun_workflow_run_failed_jobs` | `actions.reRunWorkflowFailedJobs` | POST `/repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs` |
| `approve_workflow_run` | `actions.approveWorkflowRun` | POST `/repos/{owner}/{repo}/actions/runs/{run_id}/approve` |

**Deliberate scope decisions:**

1. **All secrets/variables management excluded** (~30 methods): actions.createOrUpdate*Secret, actions.deleteOrgSecret, all `*Secret*`/`*Variable*`/`*PublicKey*` methods. Reason: secret/variable management is high-risk, warrants a dedicated plan.
2. **All runner management excluded** (~20 methods): actions.*SelfHostedRunner*, actions.*HostedRunner*, actions.createRegistrationToken*, actions.createRemoveToken*. Reason: runner lifecycle is admin surface; not aligned with the design's runtime-workflow focus.
3. **Cache management excluded**: actions.deleteActionsCache*, actions.getActionsCache*, actions.getActionsCacheUsage. Reason: cache introspection is niche; keep the workflow-focused surface at 12 tools.
4. **Permissions/OIDC/settings excluded**: actions.getGithubActionsPermissions*, actions.setGithubActionsPermissions*, actions.getCustomOidcSubClaimForRepo, actions.updateOidcCustomSubClaimForRepo. Reason: admin/security-config surface, high risk to expose via LLM.
5. **Log download tools excluded**: actions.downloadJobLogsForWorkflowRun, actions.downloadWorkflowRunLogs, actions.downloadWorkflowRunAttemptLogs. Reason: response bodies are binary (zip archives) which don't fit the raw-JSON passthrough model; would need special-case handling like `render_markdown` — could be a follow-up plan if needed.
6. **Artifact download excluded**: `downloadArtifact`. Reason: same binary-response problem; use the artifact's `archive_download_url` field from `get_artifact` externally.
7. **Delete-workflow-run excluded**: `deleteWorkflowRun`, `deleteWorkflowRunLogs`, `deleteArtifact`. Reason: destructive operations, safer as human-driven.
8. **`enable_workflow`/`disable_workflow` excluded**: `actions.enableWorkflow`, `actions.disableWorkflow`. Reason: rarely-needed admin actions; keep the toolset at 12 tools.
9. **`checks.create`/`checks.update`/`checks.createSuite` excluded**: creating checks is a bot/CI-integration concern, not typical LLM workflow.

---

## Task 1: Implement read tools (7 tools) + tests

- [x] **Step 1: Write failing tests**

See `test/unit/toolsets/actions.test.ts` at the bottom of this plan — includes tests for all 12 tools.

- [x] **Step 2: Create `src/toolsets/actions.ts`** with read tools (register 7 tools before the `if (permission === 'read-write')` block).

- [x] **Step 3: Run tests** → PASS all read tests + skip-registration tests.

- [x] **Step 4: Commit**: `git commit -m "feat: add actions toolset read tools"`

## Task 2: Add write tools + tests

- [x] **Step 1: Add write tool tests to the same test file.**

- [x] **Step 2: Add write tools inside the `if (permission === 'read-write')` block in `src/toolsets/actions.ts`.**

- [x] **Step 3: Run full suite** → 12 tools registered in read-write, 7 in read-only.

- [x] **Step 4: Commit**: `git commit -m "feat: add actions toolset write tools"`

## Task 3: Wire + README

- [x] Alphabetical import for `registerActionsTools`. Add call after `registerCodeSecurityTools`.
- [x] README bullet after `code_security`: `- \`actions\` — GitHub Actions workflows, runs, jobs, artifacts, and check runs`
- [x] `npm test && npm run typecheck && npm run lint && npm run build` all PASS.
- [x] `git commit -m "feat: wire actions toolset into buildServer"`

---

## Full verbatim code for `src/toolsets/actions.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, toToolResult, toToolError } from './common.js';

const workflowIdSchema = {
  workflow_id: z.union([z.number().int(), z.string()]).describe('Workflow ID (number) or file name (e.g. "ci.yml").'),
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
        const response = await octokit.rest.actions.listRepoWorkflows({ owner, repo, page, per_page });
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
        status: z.enum([
          'completed', 'action_required', 'cancelled', 'failure', 'neutral',
          'skipped', 'stale', 'success', 'timed_out', 'in_progress', 'queued',
          'requested', 'waiting', 'pending',
        ]).optional(),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, workflow_id, actor, branch, event, status, page, per_page }) => {
      try {
        const response = await octokit.rest.actions.listWorkflowRuns({
          owner, repo, workflow_id, actor, branch, event, status, page, per_page,
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
          owner, repo, run_id, filter, page, per_page,
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
          owner, repo, run_id, page, per_page,
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
          owner, repo, ref, check_name, status, filter, page, per_page,
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
          inputs: z.record(z.string(), z.unknown()).optional().describe('Workflow inputs (max 10 keys).'),
        }),
      },
      async ({ owner, repo, workflow_id, ref, inputs }) => {
        try {
          await octokit.rest.actions.createWorkflowDispatch({ owner, repo, workflow_id, ref, inputs });
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
            owner, repo, run_id, enable_debug_logging,
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
            owner, repo, run_id, enable_debug_logging,
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
```
