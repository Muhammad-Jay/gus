import { describe, it, expect } from 'vitest';
import { version } from '../../src/version';

describe('version', () => {
  it('should have a version', () => {
    expect(version).toBe('0.1.0');
  });
});
