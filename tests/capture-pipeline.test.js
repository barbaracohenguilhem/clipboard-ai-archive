import { describe, it, expect, beforeEach } from 'vitest';
import { processClipboardEvent } from '../background/capture-pipeline.js';
import { listRecent } from '../background/storage.js';

beforeEach(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('clipboard-archive');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
});

describe('processClipboardEvent', () => {
  it('persists a normal text copy', async () => {
    const result = await processClipboardEvent({
      text: 'hello world',
      html: null,
      hash: 'h-1',
      source_url: 'https://example.com',
      source_title: 'Example',
    });
    expect(result.stored).toBe(true);
    expect(result.id).toBeTypeOf('number');
    const items = await listRecent(10);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Text');
  });

  it('skips an item that looks like a secret', async () => {
    const result = await processClipboardEvent({
      text: 'sk-abcdefghij1234567890ABCDEF',
      html: null,
      hash: 'h-2',
      source_url: 'https://openai.com',
      source_title: 'API Keys',
    });
    expect(result.stored).toBe(false);
    expect(result.reason).toBe('secret');
    const items = await listRecent(10);
    expect(items).toHaveLength(0);
  });

  it('skips a duplicate hash', async () => {
    await processClipboardEvent({
      text: 'hello', html: null, hash: 'dup', source_url: null, source_title: null,
    });
    const second = await processClipboardEvent({
      text: 'hello', html: null, hash: 'dup', source_url: null, source_title: null,
    });
    expect(second.stored).toBe(false);
    expect(second.reason).toBe('duplicate');
  });

  it('rejects clips larger than 100KB', async () => {
    const huge = 'a'.repeat(120 * 1024);
    const result = await processClipboardEvent({
      text: huge,
      html: null,
      hash: 'h-huge',
      source_url: null,
      source_title: null,
    });
    expect(result.stored).toBe(false);
    expect(result.reason).toBe('too_large');
  });

  it('rejects empty/whitespace-only clips', async () => {
    const result = await processClipboardEvent({
      text: '   \n\t  ',
      html: null,
      hash: 'h-ws',
      source_url: null,
      source_title: null,
    });
    expect(result.stored).toBe(false);
    expect(result.reason).toBe('empty');
  });

  it('strips dangerous HTML (script tags)', async () => {
    const result = await processClipboardEvent({
      text: 'hello',
      html: '<p>hello</p><script>alert(1)</script>',
      hash: 'h-html',
      source_url: null,
      source_title: null,
    });
    expect(result.stored).toBe(true);
    const items = await listRecent(1);
    expect(items[0].html).not.toContain('<script');
    expect(items[0].html).toContain('<p>hello</p>');
  });

  it('classifies URLs', async () => {
    const result = await processClipboardEvent({
      text: 'https://example.com/page',
      html: null,
      hash: 'h-url',
      source_url: null,
      source_title: null,
    });
    expect(result.stored).toBe(true);
    const items = await listRecent(10);
    expect(items[0].type).toBe('URL');
  });
});
