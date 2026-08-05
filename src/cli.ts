// src/cli.ts
import { buildOctokitClient } from './octokit-client.js';
import { buildServer } from './server.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { runHttp } from './transports/http.js';
import { runStdio } from './transports/stdio.js';

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
      port = Number.parseInt(arg.slice('--port='.length), 10);
    }
  }

  return { transport, port };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(process.env);
  const logger = createLogger(config.logLevel);
  const octokit = buildOctokitClient(config);
  const server = buildServer(octokit, config.permission);

  if (args.transport === 'stdio') {
    logger.info('Starting github-mcp-server-js over stdio');
    await runStdio(server);
  } else {
    logger.info(`Starting github-mcp-server-js over HTTP on port ${args.port}`);
    await runHttp(server, args.port);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
