import { Octokit } from 'octokit';
import type { Config } from './config.js';

export function buildOctokitClient(config: Config): Octokit {
  return new Octokit({
    auth: config.githubToken,
    baseUrl: config.githubApiBaseUrl,
  });
}
