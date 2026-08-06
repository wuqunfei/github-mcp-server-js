import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, toToolResult, toToolError } from './common.js';

const codespaceNameSchema = {
  codespace_name: z.string().describe('The name of the codespace (e.g. "octocat-happy-space-1234").'),
};

export function registerCodespacesTools(
  server: McpServer,
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_codespaces',
    {
      description: 'List codespaces for the authenticated user. Docs: https://docs.github.com/en/rest/codespaces/codespaces#list-codespaces-for-the-authenticated-user',
      inputSchema: z.object({
        repository_id: z.number().int().optional().describe('Filter by repository ID.'),
        ...paginationSchema,
      }),
    },
    async ({ repository_id, page, per_page }) => {
      try {
        const response = await octokit.rest.codespaces.listForAuthenticatedUser({
          repository_id,
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
    'get_codespace',
    {
      description: 'Get a codespace by name for the authenticated user. Docs: https://docs.github.com/en/rest/codespaces/codespaces#get-a-codespace-for-the-authenticated-user',
      inputSchema: z.object({ ...codespaceNameSchema }),
    },
    async ({ codespace_name }) => {
      try {
        const response = await octokit.rest.codespaces.getForAuthenticatedUser({ codespace_name });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  if (permission === 'read-write') {
    server.registerTool(
      'create_codespace_in_repo',
      {
        description: 'Create a codespace in a repository for the authenticated user. Docs: https://docs.github.com/en/rest/codespaces/codespaces#create-a-codespace-in-a-repository',
        inputSchema: z.object({
          ...ownerRepoSchema,
          ref: z.string().optional().describe('Git ref (branch/tag/SHA) to base the codespace on.'),
          location: z.string().optional().describe('Preferred Azure region (e.g. "WestUs2").'),
          machine: z.string().optional().describe('Machine type (e.g. "basicLinux32gb").'),
          devcontainer_path: z.string().optional().describe('Path to devcontainer.json inside the repo.'),
          working_directory: z.string().optional().describe('Working directory inside the codespace.'),
          display_name: z.string().optional().describe('Human-readable name for the codespace.'),
        }),
      },
      async ({ owner, repo, ref, location, machine, devcontainer_path, working_directory, display_name }) => {
        try {
          const response = await octokit.rest.codespaces.createWithRepoForAuthenticatedUser({
            owner,
            repo,
            ref,
            location,
            machine,
            devcontainer_path,
            working_directory,
            display_name,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'start_codespace',
      {
        description: 'Start a stopped codespace for the authenticated user. Docs: https://docs.github.com/en/rest/codespaces/codespaces#start-a-codespace-for-the-authenticated-user',
        inputSchema: z.object({ ...codespaceNameSchema }),
      },
      async ({ codespace_name }) => {
        try {
          const response = await octokit.rest.codespaces.startForAuthenticatedUser({ codespace_name });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'stop_codespace',
      {
        description: 'Stop a running codespace for the authenticated user. Docs: https://docs.github.com/en/rest/codespaces/codespaces#stop-a-codespace-for-the-authenticated-user',
        inputSchema: z.object({ ...codespaceNameSchema }),
      },
      async ({ codespace_name }) => {
        try {
          const response = await octokit.rest.codespaces.stopForAuthenticatedUser({ codespace_name });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
}
