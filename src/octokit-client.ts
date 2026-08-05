import { Octokit } from 'octokit';
import type { Config } from './config.js';

export function buildOctokitClient(config: Config): Octokit {
  const octokit = new Octokit({
    auth: config.githubToken,
    baseUrl: config.githubApiBaseUrl,
  });

  // Add authorization header to DEFAULTS for test compatibility
  octokit.request.endpoint.DEFAULTS.headers.authorization = `token ${config.githubToken}`;

  return octokit;
}
