import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolError, toToolResult } from './common.js';

export function registerCopilotTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  // ── get_copilot_organization_details ──────────────────────────────────────

  server.registerTool(
    'get_copilot_organization_details',
    {
      description:
        'Get GitHub Copilot seat information and policy settings for an organization. ' +
        'Returns seat breakdown (total, active, inactive, pending cancellation, pending invitation, ' +
        'added this cycle), subscription plan type (business or enterprise), and policy settings ' +
        '(public code suggestions filter, IDE chat, platform chat, CLI enablement, ' +
        'seat management mode). ' +
        'Requires the authenticated user to be an organization owner. ' +
        'Requires a token with manage_billing:copilot or read:org scope. ' +
        'Returns 404 if the organization does not have a Copilot Business or Enterprise subscription. ' +
        'Returns 403 if the token lacks sufficient scope or the user is not an org owner.',
      inputSchema: z.object({
        org: z.string().describe('The organization login name (e.g. "my-company").'),
      }),
    },
    async ({ org }) => {
      try {
        const response = await octokit.rest.copilot.getCopilotOrganizationDetails({ org });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  // ── list_copilot_seats ────────────────────────────────────────────────────

  server.registerTool(
    'list_copilot_seats',
    {
      description:
        'List all GitHub Copilot seat assignments for an organization. ' +
        'Returns each assigned seat with the assignee user details, the team or organization ' +
        'through which access was granted, the seat creation date, last Copilot activity timestamp, ' +
        'last editor used, and pending cancellation date if applicable. ' +
        'Requires the authenticated user to be an organization owner. ' +
        'Requires a token with manage_billing:copilot or read:org scope. ' +
        'Returns 404 if the organization does not have a Copilot subscription. ' +
        'Returns 403 if the token lacks sufficient scope or the user is not an org owner. ' +
        'Paginate with page and per_page (default 30, max 100).',
      inputSchema: z.object({
        org: z.string().describe('The organization login name (e.g. "my-company").'),
        ...paginationSchema,
      }),
    },
    async ({ org, page, per_page }) => {
      try {
        const response = await octokit.rest.copilot.listCopilotSeats({ org, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  // ── get_copilot_seat_details_for_user ─────────────────────────────────────

  server.registerTool(
    'get_copilot_seat_details_for_user',
    {
      description:
        'Get GitHub Copilot seat assignment details for a specific member of an organization. ' +
        'Returns the seat creation date, last Copilot activity timestamp, last editor used, ' +
        'last authentication timestamp, pending cancellation date (if applicable), ' +
        'the team or organization granting access, and the Copilot plan type. ' +
        'Only returns results for users who currently have an active Copilot seat. ' +
        'Users must have telemetry enabled in their IDE for activity data to be populated. ' +
        'Requires the authenticated user to be an organization owner. ' +
        'Requires a token with manage_billing:copilot or read:org scope. ' +
        'Returns 404 if the user does not have a Copilot seat in this organization, ' +
        'or if the organization does not have a Copilot subscription. ' +
        'Returns 403 if the token lacks sufficient scope or the user is not an org owner.',
      inputSchema: z.object({
        org: z.string().describe('The organization login name (e.g. "my-company").'),
        username: z
          .string()
          .describe('The GitHub username of the organization member to look up.'),
      }),
    },
    async ({ org, username }) => {
      try {
        const response = await octokit.rest.copilot.getCopilotSeatDetailsForUser({
          org,
          username,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}
