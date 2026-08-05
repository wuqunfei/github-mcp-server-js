// test/unit/cli.test.ts
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/cli.js';

describe('parseArgs', () => {
  it('defaults to stdio transport with no arguments', () => {
    expect(parseArgs([])).toEqual({ transport: 'stdio', port: 3000 });
  });

  it('parses --transport=http', () => {
    expect(parseArgs(['--transport=http'])).toEqual({ transport: 'http', port: 3000 });
  });

  it('parses --transport=http --port=4000', () => {
    expect(parseArgs(['--transport=http', '--port=4000'])).toEqual({
      transport: 'http',
      port: 4000,
    });
  });

  it('throws on an unknown transport value', () => {
    expect(() => parseArgs(['--transport=carrier-pigeon'])).toThrow();
  });
});
