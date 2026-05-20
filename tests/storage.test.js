import { describe, it, expect, beforeEach } from 'vitest';
import {
  openDb,
  addClip,
  listRecent,
  deleteClip,
  findByHash,
  updateTags,
  deleteOlderThan,
  setPinned,
  getStats,
} from '../background/storage.js';

beforeEach(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('clipboard-archive');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
});

describe('storage', () => {
  it('opens the database and creates stores', async () => {
    const db = await openDb();
    expect([...db.objectStoreNames]).toContain('clips');
    db.close();
  });

  it('addClip persists and returns id', async () => {
    const id = await addClip({
      text: 'hello',
      html: null,
      hash: 'h1',
      type: 'Text',
      tags: [],
      source_url: null,
      source_title: null,
      created_at: Date.now(),
      pinned: false,
    });
    expect(typeof id).toBe('number');
  });

  it('listRecent returns items newest first', async () => {
    await addClip({ text: 'a', hash: 'h1', type: 'Text', tags: [], created_at: 100, pinned: false });
    await addClip({ text: 'b', hash: 'h2', type: 'Text', tags: [], created_at: 200, pinned: false });
    const items = await listRecent(10);
    expect(items.map((c) => c.text)).toEqual(['b', 'a']);
  });

  it('findByHash returns existing clip', async () => {
    await addClip({ text: 'a', hash: 'unique-h', type: 'Text', tags: [], created_at: 1, pinned: false });
    const found = await findByHash('unique-h');
    expect(found.text).toBe('a');
  });

  it('findByHash returns null when missing', async () => {
    const found = await findByHash('nope');
    expect(found).toBeNull();
  });

  it('updateTags writes tags onto an existing clip', async () => {
    const id = await addClip({ text: 'a', hash: 'h', type: 'Text', tags: [], created_at: 1, pinned: false });
    await updateTags(id, ['react', 'hooks']);
    const items = await listRecent(1);
    expect(items[0].tags).toEqual(['react', 'hooks']);
  });

  it('deleteClip removes the row', async () => {
    const id = await addClip({ text: 'a', hash: 'h', type: 'Text', tags: [], created_at: 1, pinned: false });
    await deleteClip(id);
    const items = await listRecent(10);
    expect(items).toHaveLength(0);
  });

  it('deleteOlderThan only removes unpinned old items', async () => {
    await addClip({ text: 'old', hash: 'h1', type: 'Text', tags: [], created_at: 100, pinned: false });
    await addClip({ text: 'pinned-old', hash: 'h2', type: 'Text', tags: [], created_at: 100, pinned: true });
    await addClip({ text: 'new', hash: 'h3', type: 'Text', tags: [], created_at: 5000, pinned: false });
    const removed = await deleteOlderThan(1000);
    expect(removed).toBe(1);
    const items = await listRecent(10);
    expect(items.map((c) => c.text).sort()).toEqual(['new', 'pinned-old']);
  });

  it('setPinned toggles the pinned flag', async () => {
    const id = await addClip({ text: 'a', hash: 'h', type: 'Text', tags: [], created_at: 1, pinned: false });
    await setPinned(id, true);
    const items = await listRecent(1);
    expect(items[0].pinned).toBe(true);
    await setPinned(id, false);
    const items2 = await listRecent(1);
    expect(items2[0].pinned).toBe(false);
  });

  it('getStats returns count and earliest', async () => {
    await addClip({ text: 'a', hash: 'h1', type: 'Text', tags: [], created_at: 100, pinned: false });
    await addClip({ text: 'b', hash: 'h2', type: 'Text', tags: [], created_at: 200, pinned: false });
    const stats = await getStats();
    expect(stats.count).toBe(2);
    expect(stats.earliest).toBe(100);
  });
});
