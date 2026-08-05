import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerGistsTools } from '../../../src/toolsets/gists.js';
import { connectedClient } from './test-helpers.js';

describe('registerGistsTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers list_gists and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/gists')
      .query({ page: '1', per_page: '30' })
      .reply(200, [
        {
          id: 'aa5a315d61ae9438b18d',
          description: 'Hello World',
          public: true,
          url: 'https://api.github.com/gists/aa5a315d61ae9438b18d',
        },
      ]);

    const client = await connectedClient(registerGistsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_gists',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([
      {
        id: 'aa5a315d61ae9438b18d',
        description: 'Hello World',
        public: true,
        url: 'https://api.github.com/gists/aa5a315d61ae9438b18d',
      },
    ]);
  });

  it('forwards explicit page and per_page to list_gists on the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/gists')
      .query({ page: '2', per_page: '10' })
      .reply(200, []);

    const client = await connectedClient(registerGistsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_gists',
      arguments: { page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers get_gist and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/gists/aa5a315d61ae9438b18d')
      .reply(200, {
        id: 'aa5a315d61ae9438b18d',
        description: 'Hello World',
        public: true,
        files: {
          'hello.rb': {
            filename: 'hello.rb',
            type: 'application/x-ruby',
            language: 'Ruby',
            raw_url: 'https://gist.githubusercontent.com/raw/hello.rb',
            size: 167,
            content: 'puts "Hello, World!"',
          },
        },
      });

    const client = await connectedClient(registerGistsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_gist',
      arguments: { gist_id: 'aa5a315d61ae9438b18d' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({
      id: 'aa5a315d61ae9438b18d',
      description: 'Hello World',
    });
  });

  it('propagates a 404 from get_gist as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/gists/nonexistent-gist-id-xyz')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerGistsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_gist',
      arguments: { gist_id: 'nonexistent-gist-id-xyz' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers exactly 2 read tools in read-only mode', async () => {
    const client = await connectedClient(registerGistsTools, 'read-only');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_gist', 'list_gists']);
  });
});
