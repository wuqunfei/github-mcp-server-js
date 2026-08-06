import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, toToolResult, toToolError } from './common.js';

const alertNumberSchema = {
  alert_number: z.number().int().describe('The GitHub alert number (integer, per-repo).'),
};

const ghsaIdSchema = {
  ghsa_id: z.string().describe('GHSA advisory ID (e.g. "GHSA-xxxx-yyyy-zzzz").'),
};

export function registerCodeSecurityTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_code_scanning_alerts',
    {
      description:
        'List code-scanning alerts for a repository. Requires `security_events` PAT scope for private repos, `public_repo` for public.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        tool_name: z.string().optional().describe('Filter by scanning tool name.'),
        state: z
          .enum(['open', 'dismissed', 'fixed'])
          .optional()
          .describe('Filter by alert state.'),
        sort: z.enum(['created', 'updated']).optional(),
        direction: z.enum(['asc', 'desc']).optional(),
        ref: z.string().optional().describe('Git ref to filter by (branch/tag/SHA).'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, tool_name, state, sort, direction, ref, page, per_page }) => {
      try {
        const response = await octokit.rest.codeScanning.listAlertsForRepo({
          owner,
          repo,
          tool_name,
          state,
          sort,
          direction,
          ref,
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
    'get_code_scanning_alert',
    {
      description:
        'Get a code-scanning alert. Requires `security_events` PAT scope (private) or `public_repo` (public).',
      inputSchema: z.object({ ...ownerRepoSchema, ...alertNumberSchema }),
    },
    async ({ owner, repo, alert_number }) => {
      try {
        const response = await octokit.rest.codeScanning.getAlert({ owner, repo, alert_number });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_secret_scanning_alerts',
    {
      description: 'List secret-scanning alerts for a repository. Requires `security_events` PAT scope.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        state: z.enum(['open', 'resolved']).optional().describe('Filter by state.'),
        secret_type: z.string().optional().describe('Comma-separated list of secret types to filter by.'),
        resolution: z.string().optional().describe('Comma-separated list of resolutions to filter by.'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, state, secret_type, resolution, page, per_page }) => {
      try {
        const response = await octokit.rest.secretScanning.listAlertsForRepo({
          owner,
          repo,
          state,
          secret_type,
          resolution,
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
    'get_secret_scanning_alert',
    {
      description: 'Get a secret-scanning alert. Requires `security_events` PAT scope.',
      inputSchema: z.object({ ...ownerRepoSchema, ...alertNumberSchema }),
    },
    async ({ owner, repo, alert_number }) => {
      try {
        const response = await octokit.rest.secretScanning.getAlert({
          owner,
          repo,
          alert_number,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_dependabot_alerts',
    {
      description: 'List Dependabot alerts for a repository. Requires `security_events` PAT scope.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        state: z.string().optional().describe('Comma-separated states (e.g. "open,dismissed").'),
        severity: z.string().optional().describe('Comma-separated severities.'),
        ecosystem: z.string().optional().describe('Comma-separated ecosystems.'),
        package: z.string().optional().describe('Comma-separated package names.'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, state, severity, ecosystem, package: pkg, page, per_page }) => {
      try {
        const response = await octokit.rest.dependabot.listAlertsForRepo({
          owner,
          repo,
          state,
          severity,
          ecosystem,
          package: pkg,
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
    'get_dependabot_alert',
    {
      description: 'Get a Dependabot alert. Requires `security_events` PAT scope.',
      inputSchema: z.object({ ...ownerRepoSchema, ...alertNumberSchema }),
    },
    async ({ owner, repo, alert_number }) => {
      try {
        const response = await octokit.rest.dependabot.getAlert({ owner, repo, alert_number });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_global_advisories',
    {
      description: 'List GitHub Global Security Advisories from the public GHSA database.',
      inputSchema: z.object({
        ecosystem: z
          .enum([
            'actions',
            'composer',
            'erlang',
            'go',
            'maven',
            'npm',
            'nuget',
            'other',
            'pip',
            'pub',
            'rubygems',
            'rust',
            'swift',
          ])
          .optional()
          .describe('Filter by package ecosystem.'),
        severity: z.enum(['unknown', 'low', 'medium', 'high', 'critical']).optional(),
        cwes: z.string().optional().describe('Comma-separated CWE IDs to filter by.'),
        type: z.enum(['reviewed', 'malware', 'unreviewed']).optional(),
        ...paginationSchema,
      }),
    },
    async ({ ecosystem, severity, cwes, type, page, per_page }) => {
      try {
        const response = await octokit.rest.securityAdvisories.listGlobalAdvisories({
          ecosystem,
          severity,
          cwes,
          type,
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
    'get_global_advisory',
    {
      description: 'Get a global GitHub security advisory by GHSA ID.',
      inputSchema: z.object({ ...ghsaIdSchema }),
    },
    async ({ ghsa_id }) => {
      try {
        const response = await octokit.rest.securityAdvisories.getGlobalAdvisory({ ghsa_id });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_repository_advisories',
    {
      description: 'List repository security advisories.',
      inputSchema: z.object({ ...ownerRepoSchema, ...paginationSchema }),
    },
    async ({ owner, repo, page, per_page }) => {
      try {
        const response = await octokit.rest.securityAdvisories.listRepositoryAdvisories({
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
    'get_repository_advisory',
    {
      description: 'Get a repository security advisory by GHSA ID.',
      inputSchema: z.object({ ...ownerRepoSchema, ...ghsaIdSchema }),
    },
    async ({ owner, repo, ghsa_id }) => {
      try {
        const response = await octokit.rest.securityAdvisories.getRepositoryAdvisory({
          owner,
          repo,
          ghsa_id,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}
