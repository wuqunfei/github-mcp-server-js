import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerPackagesTools } from '../../../src/toolsets/packages.js';
import { connectedClient } from './test-helpers.js';

describe('registerPackagesTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers list_packages_for_authenticated_user and returns the raw package array as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/packages')
      .query({ package_type: 'npm', page: '1', per_page: '30' })
      .reply(200, [
        {
          id: 1,
          name: 'my-package',
          package_type: 'npm',
          version_count: 3,
          visibility: 'private',
          url: 'https://api.github.com/user/packages/npm/my-package',
          html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package',
        },
      ]);

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'list_packages_for_authenticated_user',
      arguments: { package_type: 'npm' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as Array<{ name: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ name: 'my-package', package_type: 'npm' });
  });

  it('forwards visibility and pagination on list_packages_for_authenticated_user to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/user/packages')
      .query({ package_type: 'container', visibility: 'public', page: '2', per_page: '50' })
      .reply(200, []);

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'list_packages_for_authenticated_user',
      arguments: { package_type: 'container', visibility: 'public', page: 2, per_page: 50 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('propagates a 401 from list_packages_for_authenticated_user as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user/packages')
      .query({ package_type: 'npm', page: '1', per_page: '30' })
      .reply(401, {
        message: 'Requires authentication',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'list_packages_for_authenticated_user',
      arguments: { package_type: 'npm' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Requires authentication');
  });

  it('registers get_package_for_authenticated_user and returns the raw package object as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/packages/npm/my-package')
      .reply(200, {
        id: 1,
        name: 'my-package',
        package_type: 'npm',
        version_count: 3,
        visibility: 'private',
        url: 'https://api.github.com/user/packages/npm/my-package',
        html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package',
      });

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'get_package_for_authenticated_user',
      arguments: { package_type: 'npm', package_name: 'my-package' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ name: 'my-package', version_count: 3 });
  });

  it('propagates a 404 from get_package_for_authenticated_user as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user/packages/npm/nonexistent-pkg')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'get_package_for_authenticated_user',
      arguments: { package_type: 'npm', package_name: 'nonexistent-pkg' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers list_package_versions_for_authenticated_user and returns the raw package-version array as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/packages/npm/my-package/versions')
      .query({ page: '1', per_page: '30' })
      .reply(200, [
        {
          id: 101,
          name: '1.0.0',
          url: 'https://api.github.com/user/packages/npm/my-package/versions/101',
          package_html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package',
          created_at: '2022-01-01T00:00:00Z',
          updated_at: '2022-01-01T00:00:00Z',
          html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package/101',
        },
        {
          id: 102,
          name: '1.1.0',
          url: 'https://api.github.com/user/packages/npm/my-package/versions/102',
          package_html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package',
          created_at: '2022-06-01T00:00:00Z',
          updated_at: '2022-06-01T00:00:00Z',
          html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package/102',
        },
      ]);

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'list_package_versions_for_authenticated_user',
      arguments: { package_type: 'npm', package_name: 'my-package' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as Array<{ id: number; name: string }>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ id: 101, name: '1.0.0' });
  });

  it('forwards state and pagination on list_package_versions_for_authenticated_user to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/user/packages/container/my-image/versions')
      .query({ state: 'deleted', page: '2', per_page: '10' })
      .reply(200, []);

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'list_package_versions_for_authenticated_user',
      arguments: {
        package_type: 'container',
        package_name: 'my-image',
        state: 'deleted',
        page: 2,
        per_page: 10,
      },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers get_package_version_for_authenticated_user and returns the raw package-version object as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/packages/npm/my-package/versions/101')
      .reply(200, {
        id: 101,
        name: '1.0.0',
        url: 'https://api.github.com/user/packages/npm/my-package/versions/101',
        package_html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package',
        created_at: '2022-01-01T00:00:00Z',
        updated_at: '2022-01-01T00:00:00Z',
        html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package/101',
        metadata: { package_type: 'npm', npm: { name: 'my-package', version: '1.0.0' } },
      });

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'get_package_version_for_authenticated_user',
      arguments: { package_type: 'npm', package_name: 'my-package', package_version_id: 101 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ id: 101, name: '1.0.0' });
  });

  it('propagates a 404 from get_package_version_for_authenticated_user as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user/packages/npm/my-package/versions/9999')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'get_package_version_for_authenticated_user',
      arguments: { package_type: 'npm', package_name: 'my-package', package_version_id: 9999 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers exactly the 4 packages tools in read-only mode (and the same set in read-write)', async () => {
    const expected = [
      'get_package_for_authenticated_user',
      'get_package_version_for_authenticated_user',
      'list_package_versions_for_authenticated_user',
      'list_packages_for_authenticated_user',
    ];

    const readOnlyClient = await connectedClient(registerPackagesTools, 'read-only');
    const readOnlyTools = await readOnlyClient.listTools();
    expect(readOnlyTools.tools.map((t) => t.name).sort()).toEqual(expected);

    const readWriteClient = await connectedClient(registerPackagesTools, 'read-write');
    const readWriteTools = await readWriteClient.listTools();
    expect(readWriteTools.tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
