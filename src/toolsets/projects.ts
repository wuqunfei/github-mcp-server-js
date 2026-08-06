import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolResult, toToolError } from './common.js';

const orgSchema = {
  org: z.string().describe('Organization login.'),
};

const projectNumberSchema = {
  project_number: z.number().int().describe('The ProjectsV2 project number (visible in the project URL).'),
};

export function registerProjectsTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_org_projects',
    {
      description: 'List GitHub ProjectsV2 projects in an organization. Docs: https://docs.github.com/en/rest/projects/projects',
      inputSchema: z.object({ ...orgSchema, ...paginationSchema }),
    },
    async ({ org, page, per_page }) => {
      try {
        const response = await octokit.rest.projects.listForOrg({ org, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_org_project',
    {
      description: 'Get a GitHub ProjectsV2 project by number in an organization. Docs: https://docs.github.com/en/rest/projects/projects',
      inputSchema: z.object({ ...orgSchema, ...projectNumberSchema }),
    },
    async ({ org, project_number }) => {
      try {
        const response = await octokit.rest.projects.getForOrg({ org, project_number });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_org_project_items',
    {
      description: 'List items in a GitHub ProjectsV2 project. Docs: https://docs.github.com/en/rest/projects/items',
      inputSchema: z.object({ ...orgSchema, ...projectNumberSchema, ...paginationSchema }),
    },
    async ({ org, project_number, page, per_page }) => {
      try {
        const response = await octokit.rest.projects.listItemsForOrg({ org, project_number, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_org_project_fields',
    {
      description: 'List fields configured on a GitHub ProjectsV2 project. Docs: https://docs.github.com/en/rest/projects/fields',
      inputSchema: z.object({ ...orgSchema, ...projectNumberSchema, ...paginationSchema }),
    },
    async ({ org, project_number, page, per_page }) => {
      try {
        const response = await octokit.rest.projects.listFieldsForOrg({ org, project_number, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_org_project_item',
    {
      description: 'Get a single item in a GitHub ProjectsV2 project. Docs: https://docs.github.com/en/rest/projects/items',
      inputSchema: z.object({
        ...orgSchema,
        ...projectNumberSchema,
        item_id: z.number().int().describe('The project item ID.'),
      }),
    },
    async ({ org, project_number, item_id }) => {
      try {
        const response = await octokit.rest.projects.getOrgItem({ org, project_number, item_id });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}
