import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../src/logger.js';

describe('createLogger', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let output: string[];

  beforeEach(() => {
    output = [];
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        output.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
        return true;
      });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe('text format (default)', () => {
    it('emits [level] event when there are no fields', () => {
      const log = createLogger('info');
      log.info('server_start');
      expect(output).toEqual(['[info] server_start\n']);
    });

    it('appends key=value pairs for string fields', () => {
      const log = createLogger('info');
      log.info('tool_call', { name: 'get_authenticated_user', args: '{}' });
      expect(output).toEqual(['[info] tool_call name=get_authenticated_user args={}\n']);
    });

    it('JSON-encodes non-string field values', () => {
      const log = createLogger('info');
      log.info('tool_ok', { name: 'x', ms: 42 });
      expect(output).toEqual(['[info] tool_ok name=x ms=42\n']);
    });

    it('routes error() to stderr as [error]', () => {
      const log = createLogger('info');
      log.error('tool_error', { name: 'get_repository', message: 'Not Found' });
      expect(output).toEqual(['[error] tool_error name=get_repository message=Not Found\n']);
    });

    it('drops debug entries when logLevel is info', () => {
      const log = createLogger('info');
      log.debug('noise');
      expect(output).toEqual([]);
    });

    it('emits debug entries when logLevel is debug', () => {
      const log = createLogger('debug');
      log.debug('noise', { x: 1 });
      expect(output).toEqual(['[debug] noise x=1\n']);
    });
  });

  describe('json format', () => {
    it('emits one JSON object per line with ts, level, event, and fields', () => {
      const log = createLogger('info', 'json');
      log.info('tool_call', { name: 'get_authenticated_user', args: '{}' });
      expect(output).toHaveLength(1);
      expect(output[0]?.endsWith('\n')).toBe(true);
      const parsed = JSON.parse(output[0] as string);
      expect(parsed).toMatchObject({
        level: 'info',
        event: 'tool_call',
        name: 'get_authenticated_user',
        args: '{}',
      });
      expect(typeof parsed.ts).toBe('string');
      expect(new Date(parsed.ts).toString()).not.toBe('Invalid Date');
    });

    it('preserves number fields as numbers', () => {
      const log = createLogger('info', 'json');
      log.info('tool_ok', { name: 'x', ms: 123 });
      const parsed = JSON.parse(output[0] as string);
      expect(parsed.ms).toBe(123);
    });

    it('emits level:"error" for error()', () => {
      const log = createLogger('info', 'json');
      log.error('tool_error', { message: 'nope' });
      const parsed = JSON.parse(output[0] as string);
      expect(parsed.level).toBe('error');
      expect(parsed.event).toBe('tool_error');
      expect(parsed.message).toBe('nope');
    });

    it('still respects the level threshold in json mode', () => {
      const log = createLogger('error', 'json');
      log.info('quiet');
      log.error('loud');
      expect(output).toHaveLength(1);
      expect(JSON.parse(output[0] as string).event).toBe('loud');
    });
  });
});
