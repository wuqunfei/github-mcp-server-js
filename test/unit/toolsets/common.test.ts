import { describe, expect, it } from 'vitest';
import { toToolError, toToolResult } from '../../../src/toolsets/common.js';

describe('toToolResult', () => {
  it('wraps data as a JSON text content block', () => {
    const result = toToolResult({ id: 1, name: 'octocat' });
    expect(result).toEqual({
      content: [{ type: 'text', text: '{"id":1,"name":"octocat"}' }],
    });
  });
});

describe('toToolError', () => {
  it('extracts the message from an Error instance', () => {
    const result = toToolError(new Error('Not Found'));
    expect(result).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'Not Found' }],
    });
  });

  it('stringifies a non-Error value', () => {
    const result = toToolError('boom');
    expect(result).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'boom' }],
    });
  });
});
