import { Octokit } from 'octokit';
import type { Config } from './config.js';

export function buildOctokitClient(config: Config): Octokit {
  return new Octokit({
    auth: config.githubToken,
    baseUrl: config.githubApiBaseUrl,
    // Extend octokit's default doNotRetry list ([400, 401, 403, 404, 410, 422, 451])
    // with 405 and 409: deterministic, non-transient client errors that this
    // toolset's merge_pull_request can return (not-mergeable / merge-conflict).
    // Retrying these wastes rate-limit budget and turns a fast, actionable
    // error into a multi-second hang. 5xx remains retryable.
    retry: { doNotRetry: [400, 401, 403, 404, 405, 409, 410, 422, 451] },
  });
}
