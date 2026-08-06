import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasToken, hasWriteFlag, spawnServer, type McpClient } from './helpers.js';

// State-preserving write round-trips. Each test either restores the previous
// state (star/unstar) or fully cleans up its own artifact (gist create/delete).
// The suite is opt-in via INTEGRATION_WRITE=1 so it never mutates real state
// unless the user explicitly requested it.

const STAR_TARGET = { owner: 'octocat', repo: 'Hello-World' };

describe.skipIf(!hasToken || !hasWriteFlag)(
  'integration: write round-trips (real GitHub API)',
  () => {
    let client: McpClient;

    beforeAll(async () => {
      client = await spawnServer({ GITHUB_PERMISSION: 'read-write', LOG_LEVEL: 'error' });
    });

    afterAll(async () => {
      await client?.close();
    });

    it('create_gist → get_gist → update_gist → delete_gist round-trip', async () => {
      const filename = `integration-test-${Date.now()}.md`;
      const created = await client.call<{ id: string; description: string }>(
        'create_gist',
        {
          description: 'integration-test scratch',
          public: false,
          files: {
            [filename]: {
              content: '# integration test\nThis gist is deleted at the end of the test.\n',
            },
          },
        },
      );
      expect(typeof created.id).toBe('string');
      const id = created.id;

      try {
        const fetched = await client.call<{
          id: string;
          files: Record<string, { content?: string }>;
        }>('get_gist', { gist_id: id });
        expect(fetched.id).toBe(id);
        expect(fetched.files[filename]?.content).toContain('integration test');

        const updated = await client.call<{ description: string }>('update_gist', {
          gist_id: id,
          description: 'integration-test scratch (updated)',
        });
        expect(updated.description).toBe('integration-test scratch (updated)');
      } finally {
        await client.call('delete_gist', { gist_id: id });
      }

      await expect(client.call('get_gist', { gist_id: id })).rejects.toThrow(
        /Not Found/i,
      );
    });

    it('star_repo / unstar_repo restore the prior starred state', async () => {
      const before = await client.call<{ starred: boolean }>(
        'check_repo_starred',
        STAR_TARGET,
      );
      const wasStarred = before.starred;

      try {
        if (wasStarred) {
          await client.call('unstar_repo', STAR_TARGET);
          const mid = await client.call<{ starred: boolean }>(
            'check_repo_starred',
            STAR_TARGET,
          );
          expect(mid.starred).toBe(false);
        } else {
          await client.call('star_repo', STAR_TARGET);
          const mid = await client.call<{ starred: boolean }>(
            'check_repo_starred',
            STAR_TARGET,
          );
          expect(mid.starred).toBe(true);
        }
      } finally {
        if (wasStarred) {
          await client.call('star_repo', STAR_TARGET);
        } else {
          await client.call('unstar_repo', STAR_TARGET);
        }
      }

      const after = await client.call<{ starred: boolean }>(
        'check_repo_starred',
        STAR_TARGET,
      );
      expect(after.starred).toBe(wasStarred);
    });
  },
);
