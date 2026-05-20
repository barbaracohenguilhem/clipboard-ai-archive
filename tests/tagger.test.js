import { describe, it, expect } from 'vitest';
import { parseTagResponse, buildTaggerPrompt } from '../background/tagger.js';

describe('parseTagResponse', () => {
  it('parses a normal comma list', () => {
    expect(parseTagResponse('react, hooks, performance'))
      .toEqual(['react', 'hooks', 'performance']);
  });

  it('lowercases and kebab-cases', () => {
    expect(parseTagResponse('React Hooks, State Management'))
      .toEqual(['react-hooks', 'state-management']);
  });

  it('drops tags longer than 30 chars', () => {
    const long = 'a'.repeat(40);
    expect(parseTagResponse(`react, ${long}`))
      .toEqual(['react']);
  });

  it('caps at 3 tags', () => {
    expect(parseTagResponse('one, two, three, four, five'))
      .toEqual(['one', 'two', 'three']);
  });

  it('returns [] on empty', () => {
    expect(parseTagResponse('')).toEqual([]);
  });

  it('strips invalid characters', () => {
    expect(parseTagResponse('hello!, world?, ok')).toEqual(['hello', 'world', 'ok']);
  });
});

describe('buildTaggerPrompt', () => {
  it('truncates long input to 1500 chars', () => {
    const huge = 'x'.repeat(5000);
    const p = buildTaggerPrompt(huge);
    expect(p.length).toBeLessThanOrEqual(1500 + 200);
  });

  it('passes short input through unchanged', () => {
    expect(buildTaggerPrompt('hello')).toBe('hello');
  });
});
