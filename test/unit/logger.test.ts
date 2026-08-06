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

  it('emits one JSON object per line with ts, level, event, and fields', () => {
    const log = createLogger('info');
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

  it('emits just ts, level, event when no fields are supplied', () => {
    const log = createLogger('info');
    log.info('server_start');
    const parsed = JSON.parse(output[0] as string);
    expect(Object.keys(parsed).sort()).toEqual(['event', 'level', 'ts']);
    expect(parsed.event).toBe('server_start');
  });

  it('preserves number fields as numbers', () => {
    const log = createLogger('info');
    log.info('tool_ok', { name: 'x', ms: 123 });
    const parsed = JSON.parse(output[0] as string);
    expect(parsed.ms).toBe(123);
  });

  it('emits level:"error" for error()', () => {
    const log = createLogger('info');
    log.error('tool_error', { message: 'nope' });
    const parsed = JSON.parse(output[0] as string);
    expect(parsed.level).toBe('error');
    expect(parsed.event).toBe('tool_error');
    expect(parsed.message).toBe('nope');
  });

  it('drops debug entries when logLevel is info', () => {
    const log = createLogger('info');
    log.debug('noise');
    expect(output).toEqual([]);
  });

  it('emits debug entries when logLevel is debug', () => {
    const log = createLogger('debug');
    log.debug('noise', { x: 1 });
    expect(output).toHaveLength(1);
    const parsed = JSON.parse(output[0] as string);
    expect(parsed.level).toBe('debug');
    expect(parsed.event).toBe('noise');
    expect(parsed.x).toBe(1);
  });

  it('respects the error threshold', () => {
    const log = createLogger('error');
    log.info('quiet');
    log.error('loud');
    expect(output).toHaveLength(1);
    const parsed = JSON.parse(output[0] as string);
    expect(parsed.event).toBe('loud');
  });
});
