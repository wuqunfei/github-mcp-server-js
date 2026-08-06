import { describe, expect, it } from 'vitest';
import { checkVersionParity } from '../../../scripts/pack-mcpb.mjs';

describe('checkVersionParity', () => {
  it('returns undefined when versions match', () => {
    expect(
      checkVersionParity({ version: '0.1.0' }, { version: '0.1.0' }),
    ).toBeUndefined();
  });

  it('throws with a message naming both versions when they differ', () => {
    expect(() =>
      checkVersionParity({ version: '0.1.0' }, { version: '0.2.0' }),
    ).toThrow(/package\.json.*0\.1\.0.*manifest\.json.*0\.2\.0/);
  });

  it('throws when manifest.json.version is missing', () => {
    expect(() =>
      checkVersionParity({ version: '0.1.0' }, {}),
    ).toThrow(/manifest\.json.*version/);
  });

  it('throws when package.json.version is missing', () => {
    expect(() =>
      checkVersionParity({}, { version: '0.1.0' }),
    ).toThrow(/package\.json.*version/);
  });
});
