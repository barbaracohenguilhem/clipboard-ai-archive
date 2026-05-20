import { describe, it, expect } from 'vitest';
import { looksLikeSecret, DEFAULT_BLOCKLIST } from '../shared/secrets.js';

describe('looksLikeSecret', () => {
  it('returns false for normal text', () => {
    expect(looksLikeSecret({ text: 'hello world' })).toBe(false);
  });

  it('flags strong passwords', () => {
    expect(looksLikeSecret({ text: 'P@ssw0rd!xK9z' })).toBe(true);
  });

  it('flags OTP-shaped strings with verification context', () => {
    expect(
      looksLikeSecret({ text: '482913', sourceTitle: 'Verify your email' })
    ).toBe(true);
  });

  it('does NOT flag 6-digit numbers without verification context', () => {
    expect(
      looksLikeSecret({ text: '482913', sourceTitle: 'Apartment listings' })
    ).toBe(false);
  });

  it('flags OpenAI-style API keys', () => {
    expect(
      looksLikeSecret({ text: 'sk-abcdefghij1234567890ABCDEF' })
    ).toBe(true);
  });

  it('flags GitHub PATs', () => {
    expect(
      looksLikeSecret({ text: 'ghp_' + 'a'.repeat(36) })
    ).toBe(true);
  });

  it('flags JWTs (three base64 segments)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123signature';
    expect(looksLikeSecret({ text: jwt })).toBe(true);
  });

  it('flags credit card numbers (Luhn-valid)', () => {
    expect(looksLikeSecret({ text: '4539578763621486' })).toBe(true);
  });

  it('does NOT flag 16 random digits that fail Luhn', () => {
    expect(looksLikeSecret({ text: '4539578763621487' })).toBe(false);
  });

  it('flags content from blocked domains', () => {
    expect(
      looksLikeSecret({
        text: 'anything',
        sourceUrl: 'https://1password.com/vault',
        blocklist: DEFAULT_BLOCKLIST,
      })
    ).toBe(true);
  });

  it('respects custom blocklist additions', () => {
    expect(
      looksLikeSecret({
        text: 'plain',
        sourceUrl: 'https://internal-bank.example.com/x',
        blocklist: ['internal-bank.example.com'],
      })
    ).toBe(true);
  });
});
