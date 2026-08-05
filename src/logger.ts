import type { Config } from './config.js';

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  error(message: string): void;
}

const LEVEL_RANK: Record<Config['logLevel'], number> = {
  debug: 0,
  info: 1,
  error: 2,
};

export function createLogger(logLevel: Config['logLevel']): Logger {
  const threshold = LEVEL_RANK[logLevel];

  function write(level: Config['logLevel'], message: string): void {
    if (LEVEL_RANK[level] >= threshold) {
      process.stderr.write(`[${level}] ${message}\n`);
    }
  }

  return {
    debug: (message) => write('debug', message),
    info: (message) => write('info', message),
    error: (message) => write('error', message),
  };
}
