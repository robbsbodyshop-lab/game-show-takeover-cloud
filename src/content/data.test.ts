import { describe, expect, it } from 'vitest';
import { getFeudContent, getWheelContent, validateContent } from './index.ts';

describe('loaders', () => {
  it('parse each file once and return the same typed object', () => {
    expect(getFeudContent()).toBe(getFeudContent());
    expect(getWheelContent()).toBe(getWheelContent());
    expect(getFeudContent().surveys).toHaveLength(115);
    expect(getFeudContent().fastMoney).toHaveLength(79);
    expect(getWheelContent().puzzles).toHaveLength(331);
  });

  it('validateContent reports ok for the bundled files', () => {
    const result = validateContent();
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
