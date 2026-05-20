import { describe, it, expect, beforeEach } from 'vitest';
import { runRetention } from '../background/retention.js';
import { addClip, listRecent } from '../background/storage.js';

beforeEach(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('clipboard-archive');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
});

describe('runRetention', () => {
  it('removes unpinned items older than retentionDays', async () => {
    const now = Date.now();
    const dayMs = 86_400_000;
    await addClip({ text: 'old', hash: 'h1', type: 'Text', tags: [], created_at: now - 100 * dayMs, pinned: false });
    await addClip({ text: 'newish', hash: 'h2', type: 'Text', tags: [], created_at: now - 10 * dayMs, pinned: false });
    const removed = await runRetention({ retentionDays: 90, now });
    expect(removed).toBe(1);
    const remaining = await listRecent(10);
    expect(remaining.map((c) => c.text)).toEqual(['newish']);
  });

  it('keeps pinned items even if old', async () => {
    const now = Date.now();
    await addClip({ text: 'pinned-ancient', hash: 'h', type: 'Text', tags: [], created_at: 0, pinned: true });
    const removed = await runRetention({ retentionDays: 30, now });
    expect(removed).toBe(0);
  });

  it('returns 0 when retentionDays is null (disabled)', async () => {
    const now = Date.now();
    await addClip({ text: 'old', hash: 'h', type: 'Text', tags: [], created_at: 0, pinned: false });
    const removed = await runRetention({ retentionDays: null, now });
    expect(removed).toBe(0);
  });
});
