import type { Config } from './config.js';

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

const LEVEL_RANK: Record<Config['logLevel'], number> = {
  debug: 0,
  info: 1,
  error: 2,
};

// Always emits one JSON object per stderr line. Claude Desktop and any
// log-aggregation pipeline (Datadog, CloudWatch, etc.) can parse them
// directly. There is no plain-text mode.
export function createLogger(logLevel: Config['logLevel']): Logger {
  const threshold = LEVEL_RANK[logLevel];

  function write(level: Config['logLevel'], event: string, fields?: LogFields): void {
    if (LEVEL_RANK[level] >= threshold) {
      process.stderr.write(
        `${JSON.stringify({ ts: new Date().toISOString(), level, event, ...(fields ?? {}) })}\n`,
      );
    }
  }

  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}
