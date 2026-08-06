import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasToken, spawnServer, type McpClient } from './helpers.js';

// Stable public targets that should exist as long as GitHub exists.
const REPO_OWNER = 'octocat';
const REPO_NAME = 'Hello-World';
const WORKFLOW_OWNER = 'octokit';
const WORKFLOW_REPO = 'octokit.js';
const USER_LOGIN = 'octocat';

describe.skipIf(!hasToken)('integration: read-only tools (real GitHub API)', () => {
  let client: McpClient;

  beforeAll(async () => {
    client = await spawnServer({ GITHUB_PERMISSION: 'read-only', LOG_LEVEL: 'error' });
  });

  afterAll(async () => {
    await client?.close();
  });

  it('initializes and exposes only read tools', async () => {
    expect(client.serverInfo.name).toBe('github-mcp-server-js');
    const tools = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('get_authenticated_user');
    // Sanity: no write-gated tools registered in read-only mode
    expect(names).not.toContain('create_issue');
    expect(names).not.toContain('create_or_update_file');
    expect(names).not.toContain('star_repo');
  });

  describe('misc', () => {
    it('get_rate_limit returns the core/search buckets', async () => {
      const rl = await client.call<{ resources: { core: { limit: number } } }>(
        'get_rate_limit',
      );
      expect(rl.resources.core.limit).toBeGreaterThan(0);
    });

    it('list_emojis returns a non-empty map', async () => {
      const emojis = await client.call<Record<string, string>>('list_emojis');
      expect(Object.keys(emojis).length).toBeGreaterThan(100);
    });

    it('render_markdown returns HTML', async () => {
      const html = await client.call<string>('render_markdown', {
        text: '# hi **there**',
      });
      expect(typeof html).toBe('string');
      // GitHub's renderer emits an <h1> tag but with class attributes, so match
      // the opening tag prefix rather than the exact `<h1>` form.
      expect(html).toMatch(/<h1[\s>]/);
    });

    it('get_meta returns API metadata', async () => {
      const meta = await client.call<{ verifiable_password_authentication: boolean }>(
        'get_meta',
      );
      expect(typeof meta.verifiable_password_authentication).toBe('boolean');
    });
  });

  describe('users', () => {
    it('get_authenticated_user returns the token owner', async () => {
      const me = await client.call<{ login: string; id: number }>(
        'get_authenticated_user',
      );
      expect(typeof me.login).toBe('string');
      expect(me.id).toBeGreaterThan(0);
    });

    it('get_user_by_username(octocat) returns a known account', async () => {
      const u = await client.call<{ login: string; id: number }>(
        'get_user_by_username',
        { username: USER_LOGIN },
      );
      expect(u.login).toBe(USER_LOGIN);
      expect(u.id).toBe(583231);
    });

    it('list_user_followers returns an array', async () => {
      const followers = await client.call<Array<unknown>>('list_user_followers', {
        username: USER_LOGIN,
        per_page: 3,
      });
      expect(Array.isArray(followers)).toBe(true);
    });

    it('list_user_following returns an array', async () => {
      const following = await client.call<Array<unknown>>('list_user_following', {
        username: USER_LOGIN,
        per_page: 3,
      });
      expect(Array.isArray(following)).toBe(true);
    });
  });

  describe('repos', () => {
    it('get_repository(octocat/Hello-World) returns the canonical repo', async () => {
      const r = await client.call<{ full_name: string; id: number }>('get_repository', {
        owner: REPO_OWNER,
        repo: REPO_NAME,
      });
      expect(r.full_name).toBe(`${REPO_OWNER}/${REPO_NAME}`);
      expect(r.id).toBeGreaterThan(0);
    });

    it('list_branches returns at least one branch', async () => {
      const branches = await client.call<Array<{ name: string }>>('list_branches', {
        owner: REPO_OWNER,
        repo: REPO_NAME,
        per_page: 5,
      });
      expect(branches.length).toBeGreaterThan(0);
    });

    it('list_commits returns commits', async () => {
      const commits = await client.call<Array<{ sha: string }>>('list_commits', {
        owner: REPO_OWNER,
        repo: REPO_NAME,
        per_page: 3,
      });
      expect(commits.length).toBeGreaterThan(0);
      expect(typeof commits[0]?.sha).toBe('string');
    });

    it('list_tags returns an array', async () => {
      const tags = await client.call<Array<unknown>>('list_tags', {
        owner: REPO_OWNER,
        repo: REPO_NAME,
        per_page: 3,
      });
      expect(Array.isArray(tags)).toBe(true);
    });
  });

  describe('issues + pull_requests', () => {
    it('list_issues returns an array', async () => {
      const issues = await client.call<Array<unknown>>('list_issues', {
        owner: REPO_OWNER,
        repo: REPO_NAME,
        per_page: 3,
        state: 'all',
      });
      expect(Array.isArray(issues)).toBe(true);
    });

    it('list_pull_requests returns an array', async () => {
      const prs = await client.call<Array<unknown>>('list_pull_requests', {
        owner: REPO_OWNER,
        repo: REPO_NAME,
        per_page: 3,
        state: 'all',
      });
      expect(Array.isArray(prs)).toBe(true);
    });
  });

  describe('search', () => {
    it('search_repos with a stable query returns results', async () => {
      const res = await client.call<{ total_count: number; items: Array<unknown> }>(
        'search_repos',
        { q: 'language:javascript stars:>10000', per_page: 3 },
      );
      expect(res.total_count).toBeGreaterThan(0);
      expect(Array.isArray(res.items)).toBe(true);
    });

    it('search_code with a stable query returns results', async () => {
      const res = await client.call<{ total_count: number }>('search_code', {
        q: 'addClass repo:jquery/jquery in:file',
        per_page: 3,
      });
      expect(res.total_count).toBeGreaterThanOrEqual(0);
    });

    it('search_users finds octocat', async () => {
      const res = await client.call<{ items: Array<{ login: string }> }>(
        'search_users',
        { q: 'octocat in:login', per_page: 3 },
      );
      expect(res.items.length).toBeGreaterThan(0);
    });
  });

  describe('activity + gists', () => {
    it('list_starred_repos returns an array', async () => {
      const stars = await client.call<Array<unknown>>('list_starred_repos', {
        per_page: 3,
      });
      expect(Array.isArray(stars)).toBe(true);
    });

    it('check_repo_starred on a stable public repo returns a boolean', async () => {
      const res = await client.call<{ starred: boolean }>('check_repo_starred', {
        owner: REPO_OWNER,
        repo: REPO_NAME,
      });
      expect(typeof res.starred).toBe('boolean');
    });

    it('list_notifications returns an array', async () => {
      const notifications = await client.call<Array<unknown>>('list_notifications', {
        per_page: 3,
      });
      expect(Array.isArray(notifications)).toBe(true);
    });

    it('list_gists returns an array', async () => {
      const gists = await client.call<Array<unknown>>('list_gists', { per_page: 3 });
      expect(Array.isArray(gists)).toBe(true);
    });
  });

  describe('actions', () => {
    it('list_workflows on octokit.js returns at least one workflow', async () => {
      const res = await client.call<{ total_count: number; workflows: Array<unknown> }>(
        'list_workflows',
        { owner: WORKFLOW_OWNER, repo: WORKFLOW_REPO, per_page: 5 },
      );
      expect(res.total_count).toBeGreaterThan(0);
    });
  });

  describe('apps', () => {
    it('list_installations_for_authenticated_user either succeeds or rejects a PAT with the expected auth error', async () => {
      // This endpoint requires a user-to-server GitHub App token. A regular
      // personal access token gets a documented 403. We accept either shape:
      // success (App token) or the specific auth-error message (PAT).
      try {
        const res = await client.call<{ total_count: number }>(
          'list_installations_for_authenticated_user',
          { per_page: 3 },
        );
        expect(typeof res.total_count).toBe('number');
      } catch (err) {
        expect(String(err)).toMatch(
          /authorized to a GitHub App|user-to-server|must authenticate/i,
        );
      }
    });
  });

  describe('error propagation', () => {
    it('get_repository on a non-existent repo surfaces a 404 as isError', async () => {
      await expect(
        client.call('get_repository', {
          owner: 'octocat',
          repo: 'this-repo-definitely-does-not-exist-integration-test-guard',
        }),
      ).rejects.toThrow(/Not Found/i);
    });
  });
});
