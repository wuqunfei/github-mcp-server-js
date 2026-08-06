// src/cli.ts
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildOctokitClient } from './octokit-client.js';
import { buildServer } from './server.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { runStdio } from './transports/stdio.js';
// NOTE: runHttp is dynamically imported inside main() so the HTTP transport's
// dep chain (@whatwg-node/server → @whatwg-node/node-fetch, which does
// `require('buffer')` at CJS module top-level) does NOT load in the stdio path.
// That keeps the .mcpb Claude Desktop Extension bundle working under pure ESM.

export interface CliArgs {
  transport: 'stdio' | 'http';
  port: number;
}

export function parseArgs(argv: string[]): CliArgs {
  let transport: CliArgs['transport'] = 'stdio';
  let port = 3000;

  for (const arg of argv) {
    if (arg.startsWith('--transport=')) {
      const value = arg.slice('--transport='.length);
      if (value !== 'stdio' && value !== 'http') {
        throw new Error(`Unknown --transport value: "${value}" (expected "stdio" or "http")`);
      }
      transport = value;
    } else if (arg.startsWith('--port=')) {
      const value = arg.slice('--port='.length);
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || String(parsed) !== value || parsed < 1 || parsed > 65535) {
        throw new Error(`Invalid --port value: "${value}" (expected an integer between 1 and 65535)`);
      }
      port = parsed;
    }
  }

  return { transport, port };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(process.env);
  const logger = createLogger(config.logLevel, config.logFormat);
  const octokit = buildOctokitClient(config);
  const server = buildServer(octokit, config.permission, logger);

  if (args.transport === 'stdio') {
    logger.info('server_start', { transport: 'stdio' });
    await runStdio(server);
  } else {
    logger.info('server_start', { transport: 'http', port: args.port });
    const { runHttp } = await import('./transports/http.js');
    await runHttp(server, args.port);
  }
}

function isDirectEntry(): boolean {
  const arg1 = process.argv[1];
  if (!arg1) return false;
  // Compare via realpath on both sides so macOS temp paths (/var/folders/…
  // → /private/var/folders/…) and other symlinks don't cause a silent no-op.
  try {
    return realpathSync(arg1) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectEntry()) {
  main().catch((error: unknown) => {
    process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
