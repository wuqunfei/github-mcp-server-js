export interface Config {
  githubToken: string;
  githubApiBaseUrl: string;
  permission: 'read-only' | 'read-write';
  logLevel: 'debug' | 'info' | 'error';
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const PERMISSIONS = ['read-only', 'read-write'] as const;
const LOG_LEVELS = ['debug', 'info', 'error'] as const;

function normalizeServerUrl(rawValue: string | undefined): string {
  if (!rawValue) {
    return 'https://api.github.com';
  }

  const withScheme = rawValue.startsWith('http://') || rawValue.startsWith('https://')
    ? rawValue
    : `https://${rawValue}`;

  const url = new URL(withScheme);
  const isRootPath = url.pathname === '/' || url.pathname === '';

  if (isRootPath && url.hostname.toLowerCase() === 'github.com') {
    return 'https://api.github.com';
  }

  if (isRootPath) {
    url.pathname = '/api/v3';
  }
  return url.toString().replace(/\/$/, '');
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const githubToken = env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new ConfigError('GITHUB_TOKEN environment variable is required');
  }

  const permission = env.GITHUB_PERMISSION ?? 'read-write';
  if (!PERMISSIONS.includes(permission as (typeof PERMISSIONS)[number])) {
    throw new ConfigError(
      `GITHUB_PERMISSION must be one of ${PERMISSIONS.join(', ')}, got "${permission}"`,
    );
  }

  const logLevel = env.LOG_LEVEL ?? 'info';
  if (!LOG_LEVELS.includes(logLevel as (typeof LOG_LEVELS)[number])) {
    throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${logLevel}"`);
  }

  return {
    githubToken,
    githubApiBaseUrl: normalizeServerUrl(env.GITHUB_SERVER_URL),
    permission: permission as Config['permission'],
    logLevel: logLevel as Config['logLevel'],
  };
}
