import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { toToolError, toToolResult } from './common.js';

export function registerMiscTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  // ── get_rate_limit ─────────────────────────────────────────────────────────

  server.registerTool(
    'get_rate_limit',
    {
      description:
        'Get the current API rate limit status for the authenticated user.' +
        'Returns a rate-limit-overview object with per-category breakdowns ' +
        '(core, search, graphql, code_search, actions_runner_registration, etc.), ' +
        'each showing limit, used, remaining, and reset timestamp (Unix epoch seconds). ' +
        'Accessing this endpoint does not itself consume any rate limit quota.  Docs: https://docs.github.com/en/rest/rate-limit/rate-limit#get-rate-limit-status-for-the-authenticated-user',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const response = await octokit.rest.rateLimit.get();
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  // ── get_meta ───────────────────────────────────────────────────────────────

  server.registerTool(
    'get_meta',
    {
      description:
        'Get GitHub API metadata: IP address ranges for GitHub services' +
        '(hooks, web, api, git, packages, pages, importer, actions, dependabot, copilot), ' +
        'SSH key fingerprints, SSH public keys used to sign GitHub commits, ' +
        'and whether GitHub password authentication is enabled. ' +
        'Useful for firewall allowlisting, SSH host verification, and infrastructure automation. ' +
        'Returns an api-overview object. Safe to call without authentication.  Docs: https://docs.github.com/en/rest/meta/meta#get-github-meta-information',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const response = await octokit.rest.meta.get();
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  // ── list_emojis ────────────────────────────────────────────────────────────

  server.registerTool(
    'list_emojis',
    {
      description:
        'List all emoji names available to use on GitHub, with their corresponding image URLs.' +
        'Returns a flat JSON object mapping each emoji name (e.g. "smile", "+1", "octocat") ' +
        'to its CDN image URL on github.githubassets.com. ' +
        'Useful for populating emoji pickers, validating emoji names, or fetching emoji images.  Docs: https://docs.github.com/en/rest/emojis/emojis#get-emojis',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const response = await octokit.rest.emojis.get();
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  // ── render_markdown ────────────────────────────────────────────────────────

  server.registerTool(
    'render_markdown',
    {
      description:
        "Render a Markdown string to HTML using GitHub's Markdown renderer. " +
        'Returns the rendered HTML as a plain text string (not JSON-encoded). ' +
        'Use mode "markdown" (default) for standard Markdown. ' +
        'Use mode "gfm" (GitHub Flavored Markdown) to enable cross-references ' +
        'such as #42 linking to issues and @mentions — requires the context parameter ' +
        'to specify the repository (e.g. "owner/repo") for resolving those references. ' +
        'This endpoint is stateless: it renders and returns HTML without modifying any data. ' +
        'Docs: https://docs.github.com/en/rest/markdown/markdown#render-a-markdown-document',
      inputSchema: z.object({
        text: z.string().describe('The Markdown text to render to HTML.'),
        mode: z
          .enum(['markdown', 'gfm'])
          .optional()
          .describe(
            'Rendering mode. "markdown" (default) renders standard Markdown. ' +
              '"gfm" renders GitHub Flavored Markdown with cross-reference support ' +
              '(requires the context parameter to resolve issue and PR references).',
          ),
        context: z
          .string()
          .optional()
          .describe(
            'Repository context for resolving cross-references in gfm mode, ' +
              'in "owner/repo" format (e.g. "octo-org/octo-repo"). ' +
              'Ignored when mode is "markdown".',
          ),
      }),
    },
    async ({ text, mode, context }) => {
      try {
        const response = await octokit.rest.markdown.render({ text, mode, context });
        // response.data is a raw HTML string (Content-Type: text/html), NOT a JSON value.
        // toToolResult would call JSON.stringify on it, producing a double-encoded string.
        // Build the MCP content array directly to preserve the raw HTML text.
        return { content: [{ type: 'text' as const, text: response.data as string }] };
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}
