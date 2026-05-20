import { describe, it, expect } from 'vitest';
import { classifyType } from '../shared/classifier.js';

describe('classifyType', () => {
  it('detects URL', () => {
    expect(classifyType('https://example.com/path?q=1')).toBe('URL');
    expect(classifyType('http://localhost:3000')).toBe('URL');
  });

  it('detects Email', () => {
    expect(classifyType('hello@example.com')).toBe('Email');
  });

  it('detects Phone', () => {
    expect(classifyType('+1 (555) 123-4567')).toBe('Phone');
    expect(classifyType('+5511987654321')).toBe('Phone');
  });

  it('detects Color (hex)', () => {
    expect(classifyType('#ff00aa')).toBe('Color');
    expect(classifyType('#FFF')).toBe('Color');
  });

  it('detects Color (rgb/hsl)', () => {
    expect(classifyType('rgb(255, 0, 0)')).toBe('Color');
    expect(classifyType('hsl(120, 100%, 50%)')).toBe('Color');
  });

  it('detects Code', () => {
    expect(
      classifyType('function foo(x) {\n  return x + 1;\n}')
    ).toBe('Code');
    expect(
      classifyType('def greet(name):\n    print(f"hi {name}")')
    ).toBe('Code');
  });

  it('falls back to Text for prose', () => {
    expect(
      classifyType('The quick brown fox jumps over the lazy dog.')
    ).toBe('Text');
  });

  it('returns Text for empty string', () => {
    expect(classifyType('')).toBe('Text');
  });
});
