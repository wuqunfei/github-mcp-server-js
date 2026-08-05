import { z } from 'zod';

export const paginationSchema = {
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(100).default(30),
};

export const ownerRepoSchema = {
  owner: z.string().describe('Repository owner (user or organization login)'),
  repo: z.string().describe('Repository name'),
};

export const issueNumberSchema = {
  issue_number: z.number().int().describe('Issue number'),
};

export const pullNumberSchema = {
  pull_number: z.number().int().describe('Pull request number'),
};

export function toToolResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  };
}

export function toToolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}
