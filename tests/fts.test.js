import { describe, it, expect } from 'vitest';
import { tokenize } from '../shared/fts.js';

describe('tokenize', () => {
  it('lowercases and splits on non-word', () => {
    expect(tokenize('Hello, World!')).toEqual(['hello', 'world']);
  });

  it('drops short tokens (<3 chars)', () => {
    expect(tokenize('a an the cat')).toEqual(['cat']);
  });

  it('drops stopwords', () => {
    const tokens = tokenize('the quick brown fox');
    expect(tokens).not.toContain('the');
    expect(tokens).toContain('quick');
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('deduplicates tokens', () => {
    expect(tokenize('cat cat cat dog')).toEqual(['cat', 'dog']);
  });
});
