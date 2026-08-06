import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '../../dist/cli.js');

export const hasToken = Boolean(process.env.GITHUB_TOKEN);
export const hasWriteFlag = process.env.INTEGRATION_WRITE === '1';

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: {
    isError?: boolean;
    content?: Array<{ type: string; text: string }>;
    tools?: Array<{ name: string; description?: string }>;
    serverInfo?: { name: string; version: string };
  };
  error?: { code: number; message: string };
}

export interface McpClient {
  call<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T>;
  listTools(): Promise<Array<{ name: string; description?: string }>>;
  serverInfo: { name: string; version: string };
  close(): Promise<void>;
}

export async function spawnServer(
  env: Record<string, string | undefined> = {},
): Promise<McpClient> {
  if (!existsSync(CLI_PATH)) {
    throw new Error(
      `dist/cli.js not found at ${CLI_PATH}. Run \`npm run build\` first (or use the test:integration script which builds automatically).`,
    );
  }

  const child = spawn('node', [CLI_PATH], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (d: Buffer) => {
    stderr += d.toString();
  });

  const pending = new Map<
    number,
    { resolve: (v: JsonRpcResponse) => void; reject: (e: Error) => void }
  >();
  let nextId = 1;
  let buf = '';

  child.stdout.on('data', (chunk: Buffer) => {
    buf += chunk.toString();
    let idx: number;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg: JsonRpcResponse;
      try {
        msg = JSON.parse(line) as JsonRpcResponse;
      } catch {
        continue;
      }
      if (msg.id != null && pending.has(msg.id)) {
        const entry = pending.get(msg.id);
        pending.delete(msg.id);
        entry?.resolve(msg);
      }
    }
  });

  const send = (method: string, params?: unknown): Promise<JsonRpcResponse> => {
    const id = nextId++;
    return new Promise<JsonRpcResponse>((resolvePromise, rejectPromise) => {
      pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          rejectPromise(
            new Error(`timeout: ${method} (stderr: ${stderr.slice(0, 500)})`),
          );
        }
      }, 20_000);
    });
  };

  const initResponse = await send('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'integration-test', version: '0.0.1' },
  });
  child.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
  );

  const serverInfo = initResponse.result?.serverInfo ?? { name: '', version: '' };

  return {
    serverInfo,
    async call<T = unknown>(
      name: string,
      args: Record<string, unknown> = {},
    ): Promise<T> {
      const res = await send('tools/call', { name, arguments: args });
      if (res.error) throw new Error(`tools/call ${name}: ${res.error.message}`);
      const text = res.result?.content?.[0]?.text;
      if (res.result?.isError) {
        throw new Error(`tool error [${name}]: ${text ?? '(no message)'}`);
      }
      if (typeof text !== 'string') return res.result as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    },
    async listTools() {
      const res = await send('tools/list', {});
      return res.result?.tools ?? [];
    },
    async close() {
      child.kill();
      await new Promise<void>((r) => {
        child.once('exit', () => r());
      });
    },
  };
}
