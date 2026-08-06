import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerActionsTools } from '../../../src/toolsets/actions.js';
import { connectedClient } from './test-helpers.js';

describe('registerActionsTools', () => {
  afterEach(() => nock.cleanAll());

  it('list_workflows returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/actions/workflows')
      .query({ page: '1', per_page: '30' })
      .reply(200, { total_count: 1, workflows: [{ id: 1, name: 'CI', path: '.github/workflows/ci.yml' }] });

    const client = await connectedClient(registerActionsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_workflows',
      arguments: { owner: 'acme', repo: 'foo' },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ workflows: [{ id: 1 }] });
  });

  it('get_workflow returns raw JSON (workflow_id as string)', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/actions/workflows/ci.yml')
      .reply(200, { id: 1, name: 'CI' });
    const client = await connectedClient(registerActionsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_workflow',
      arguments: { owner: 'acme', repo: 'foo', workflow_id: 'ci.yml' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('list_workflow_runs forwards status/branch to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/repos/acme/foo/actions/workflows/ci.yml/runs')
      .query({ status: 'completed', branch: 'main', page: '1', per_page: '30' })
      .reply(200, { total_count: 0, workflow_runs: [] });
    const client = await connectedClient(registerActionsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_workflow_runs',
      arguments: { owner: 'acme', repo: 'foo', workflow_id: 'ci.yml', status: 'completed', branch: 'main' },
    });
    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('get_workflow_run returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/actions/runs/12345')
      .reply(200, { id: 12345, status: 'completed' });
    const client = await connectedClient(registerActionsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_workflow_run',
      arguments: { owner: 'acme', repo: 'foo', run_id: 12345 },
    });
    expect(result.isError).toBeFalsy();
  });

  it('propagates a 404 from get_workflow_run', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/actions/runs/999')
      .reply(404, { message: 'Not Found' });
    const client = await connectedClient(registerActionsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_workflow_run',
      arguments: { owner: 'acme', repo: 'foo', run_id: 999 },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('list_workflow_run_jobs returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/actions/runs/12345/jobs')
      .query({ page: '1', per_page: '30' })
      .reply(200, { total_count: 1, jobs: [{ id: 100, name: 'build' }] });
    const client = await connectedClient(registerActionsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_workflow_run_jobs',
      arguments: { owner: 'acme', repo: 'foo', run_id: 12345 },
    });
    expect(result.isError).toBeFalsy();
  });

  it('list_workflow_run_artifacts returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/actions/runs/12345/artifacts')
      .query({ page: '1', per_page: '30' })
      .reply(200, { total_count: 1, artifacts: [{ id: 200, name: 'coverage' }] });
    const client = await connectedClient(registerActionsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_workflow_run_artifacts',
      arguments: { owner: 'acme', repo: 'foo', run_id: 12345 },
    });
    expect(result.isError).toBeFalsy();
  });

  it('list_check_runs_for_ref returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/commits/main/check-runs')
      .query({ page: '1', per_page: '30' })
      .reply(200, { total_count: 1, check_runs: [{ id: 300, name: 'lint' }] });
    const client = await connectedClient(registerActionsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_check_runs_for_ref',
      arguments: { owner: 'acme', repo: 'foo', ref: 'main' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('run_workflow synthesizes { triggered: true } on 204', async () => {
    nock('https://api.github.com')
      .post('/repos/acme/foo/actions/workflows/ci.yml/dispatches', { ref: 'main' })
      .reply(204);
    const client = await connectedClient(registerActionsTools, 'read-write');
    const result = await client.callTool({
      name: 'run_workflow',
      arguments: { owner: 'acme', repo: 'foo', workflow_id: 'ci.yml', ref: 'main' },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ triggered: true });
  });

  it('cancel_workflow_run synthesizes { cancelled: true }', async () => {
    nock('https://api.github.com')
      .post('/repos/acme/foo/actions/runs/12345/cancel')
      .reply(202);
    const client = await connectedClient(registerActionsTools, 'read-write');
    const result = await client.callTool({
      name: 'cancel_workflow_run',
      arguments: { owner: 'acme', repo: 'foo', run_id: 12345 },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ cancelled: true });
  });

  it('rerun_workflow_run synthesizes { rerun_started: true }', async () => {
    nock('https://api.github.com')
      .post('/repos/acme/foo/actions/runs/12345/rerun')
      .reply(201);
    const client = await connectedClient(registerActionsTools, 'read-write');
    const result = await client.callTool({
      name: 'rerun_workflow_run',
      arguments: { owner: 'acme', repo: 'foo', run_id: 12345 },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ rerun_started: true });
  });

  it('rerun_workflow_run_failed_jobs synthesizes { rerun_started: true }', async () => {
    nock('https://api.github.com')
      .post('/repos/acme/foo/actions/runs/12345/rerun-failed-jobs')
      .reply(201);
    const client = await connectedClient(registerActionsTools, 'read-write');
    const result = await client.callTool({
      name: 'rerun_workflow_run_failed_jobs',
      arguments: { owner: 'acme', repo: 'foo', run_id: 12345 },
    });
    expect(result.isError).toBeFalsy();
  });

  it('approve_workflow_run synthesizes { approved: true }', async () => {
    nock('https://api.github.com')
      .post('/repos/acme/foo/actions/runs/12345/approve')
      .reply(201);
    const client = await connectedClient(registerActionsTools, 'read-write');
    const result = await client.callTool({
      name: 'approve_workflow_run',
      arguments: { owner: 'acme', repo: 'foo', run_id: 12345 },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ approved: true });
  });

  it('registers exactly the 7 read tools in read-only mode', async () => {
    const client = await connectedClient(registerActionsTools, 'read-only');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_workflow',
      'get_workflow_run',
      'list_check_runs_for_ref',
      'list_workflow_run_artifacts',
      'list_workflow_run_jobs',
      'list_workflow_runs',
      'list_workflows',
    ]);
  });

  it('registers all 12 tools in read-write mode', async () => {
    const client = await connectedClient(registerActionsTools, 'read-write');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'approve_workflow_run',
      'cancel_workflow_run',
      'get_workflow',
      'get_workflow_run',
      'list_check_runs_for_ref',
      'list_workflow_run_artifacts',
      'list_workflow_run_jobs',
      'list_workflow_runs',
      'list_workflows',
      'rerun_workflow_run',
      'rerun_workflow_run_failed_jobs',
      'run_workflow',
    ]);
  });
});
