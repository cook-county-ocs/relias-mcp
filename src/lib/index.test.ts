import { describe, it, expect } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('library scaffolding', () => {
  it('exposes the published package name', () => {
    expect(PACKAGE_NAME).toBe('@cook-county-ocs/relias-mcp');
  });
});
