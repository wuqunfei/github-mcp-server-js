import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/server';
import nock from 'nock';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { runHttp } from '../../../src/transports/http.js';

async function initialize(baseUrl: string): Promise<{ status: number; sessionId: string | null }> {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '0.0.0' },
      },
    }),
  });
  return { status: response.status, sessionId: response.headers.get('mcp-session-id') };
}

async function deleteSession(baseUrl: string, sessionId: string): Promise<number> {
  const response = await fetch(baseUrl, {
    method: 'DELETE',
    headers: { 'mcp-session-id': sessionId },
  });
  return response.status;
}

async function listTools(baseUrl: string, sessionId: string): Promise<number> {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-session-id': sessionId,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  });
  await response.text();
  return response.status;
}

describe('runHttp', () => {
  let cleanup: (() => Promise<void>) | undefined;

  // This suite talks to a real HTTP server bound to localhost (the server
  // under test), not to api.github.com, so it needs an explicit exception
  // from the global `nock.disableNetConnect()` set up in test/setup.ts.
  beforeAll(() => {
    nock.enableNetConnect('127.0.0.1');
  });

  afterAll(() => {
    nock.disableNetConnect();
  });

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it('accepts a new session after the previous session is closed', async () => {
    const server = new McpServer({ name: 'test-server', version: '0.0.0' });
    const httpServer = await runHttp(server, 0);
    cleanup = () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });

    const { port } = httpServer.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}/`;

    // First session: initialize, then end it with a DELETE request.
    const first = await initialize(baseUrl);
    expect(first.status).toBe(200);
    expect(first.sessionId).toBeTruthy();

    const deleteStatus = await deleteSession(baseUrl, first.sessionId as string);
    expect(deleteStatus).toBe(200);

    // Without the fix, every request from here on gets 404 "Session not
    // found" for the remaining lifetime of the process, even though the
    // HTTP server is still listening.
    const second = await initialize(baseUrl);
    expect(second.status).toBe(200);
    expect(second.sessionId).toBeTruthy();
    expect(second.sessionId).not.toBe(first.sessionId);
  });

  it('serves multiple requests within one session on the same transport', async () => {
    const server = new McpServer({ name: 'test-server', version: '0.0.0' });
    const httpServer = await runHttp(server, 0);
    cleanup = () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });

    const { port } = httpServer.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}/`;

    const { status, sessionId } = await initialize(baseUrl);
    expect(status).toBe(200);
    expect(sessionId).toBeTruthy();

    // Multiple requests against the same still-open session must be served
    // by the same transport instance without any reconnect happening.
    expect(await listTools(baseUrl, sessionId as string)).toBe(200);
    expect(await listTools(baseUrl, sessionId as string)).toBe(200);
  });

  it('supports repeated session close/reopen cycles', async () => {
    const server = new McpServer({ name: 'test-server', version: '0.0.0' });
    const httpServer = await runHttp(server, 0);
    cleanup = () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });

    const { port } = httpServer.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}/`;

    const seenSessionIds = new Set<string>();
    for (let round = 0; round < 3; round += 1) {
      const { status, sessionId } = await initialize(baseUrl);
      expect(status).toBe(200);
      expect(sessionId).toBeTruthy();
      expect(seenSessionIds.has(sessionId as string)).toBe(false);
      seenSessionIds.add(sessionId as string);

      expect(await deleteSession(baseUrl, sessionId as string)).toBe(200);
    }
  });
});
