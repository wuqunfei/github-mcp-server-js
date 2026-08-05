import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolResult, toToolError } from './common.js';

const packageTypeSchema = z
  .enum(['npm', 'maven', 'rubygems', 'docker', 'nuget', 'container'])
  .describe(
    'The type of package. One of: npm, maven, rubygems, docker, nuget, container. ' +
      'Packages pushed to GitHub Container Registry (ghcr.io) have type "container". ' +
      'Packages pushed to the legacy Docker registry (docker.pkg.github.com) have type "docker".',
  );

export function registerPackagesTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_packages_for_authenticated_user',
    {
      description:
        'List packages owned by the authenticated user (the owner of GITHUB_TOKEN). ' +
        'Requires the read:packages token scope. The package_type filter is required — ' +
        'pass one of npm, maven, rubygems, docker, nuget, or container. ' +
        'Optionally filter by visibility (public, private, internal). ' +
        'Paginate with page and per_page.',
      inputSchema: z.object({
        package_type: packageTypeSchema,
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Filter packages by visibility. Returns all visibilities if omitted.'),
        ...paginationSchema,
      }),
    },
    async ({ package_type, visibility, page, per_page }) => {
      try {
        const response = await octokit.rest.packages.listPackagesForAuthenticatedUser({
          package_type,
          visibility,
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
    'get_package_for_authenticated_user',
    {
      description:
        'Get a specific package owned by the authenticated user. ' +
        'Returns the package metadata including name, type, version count, visibility, ' +
        'repository link, and timestamps. Requires the read:packages token scope.',
      inputSchema: z.object({
        package_type: packageTypeSchema,
        package_name: z.string().describe('The name of the package.'),
      }),
    },
    async ({ package_type, package_name }) => {
      try {
        const response = await octokit.rest.packages.getPackageForAuthenticatedUser({
          package_type,
          package_name,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_package_versions_for_authenticated_user',
    {
      description:
        'List all versions of a package owned by the authenticated user. ' +
        'Returns an array of package-version objects, each with an id, version name, ' +
        'creation/update timestamps, and type-specific metadata (e.g. container tags, npm dist-tags). ' +
        'Optionally filter by state: "active" (default) returns live versions; ' +
        '"deleted" returns versions that have been deleted but can still be restored within 30 days. ' +
        'Requires the read:packages token scope.',
      inputSchema: z.object({
        package_type: packageTypeSchema,
        package_name: z.string().describe('The name of the package.'),
        state: z
          .enum(['active', 'deleted'])
          .optional()
          .describe(
            'Filter versions by state. "active" returns live versions (default); ' +
              '"deleted" returns versions deleted within the last 30 days.',
          ),
        ...paginationSchema,
      }),
    },
    async ({ package_type, package_name, state, page, per_page }) => {
      try {
        const response =
          await octokit.rest.packages.getAllPackageVersionsForPackageOwnedByAuthenticatedUser({
            package_type,
            package_name,
            state,
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
    'get_package_version_for_authenticated_user',
    {
      description:
        'Get a specific version of a package owned by the authenticated user. ' +
        'Returns the package-version object including the version id, name, ' +
        'creation/update timestamps, and type-specific metadata. ' +
        'Use list_package_versions_for_authenticated_user to find version ids. ' +
        'Requires the read:packages token scope.',
      inputSchema: z.object({
        package_type: packageTypeSchema,
        package_name: z.string().describe('The name of the package.'),
        package_version_id: z
          .number()
          .int()
          .describe('The unique identifier of the package version.'),
      }),
    },
    async ({ package_type, package_name, package_version_id }) => {
      try {
        const response = await octokit.rest.packages.getPackageVersionForAuthenticatedUser({
          package_type,
          package_name,
          package_version_id,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}
