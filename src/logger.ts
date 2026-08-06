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

function renderText(level: Config['logLevel'], event: string, fields: LogFields): string {
  const suffix = Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
  return suffix ? `[${level}] ${event} ${suffix}\n` : `[${level}] ${event}\n`;
}

function renderJson(level: Config['logLevel'], event: string, fields: LogFields): string {
  return `${JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields })}\n`;
}

export function createLogger(
  logLevel: Config['logLevel'],
  logFormat: Config['logFormat'] = 'text',
): Logger {
  const threshold = LEVEL_RANK[logLevel];
  const render = logFormat === 'json' ? renderJson : renderText;

  function write(level: Config['logLevel'], event: string, fields?: LogFields): void {
    if (LEVEL_RANK[level] >= threshold) {
      process.stderr.write(render(level, event, fields ?? {}));
    }
  }

  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}
