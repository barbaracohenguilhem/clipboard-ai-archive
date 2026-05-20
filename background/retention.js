import { deleteOlderThan } from './storage.js';

const DAY_MS = 86_400_000;

export async function runRetention({ retentionDays, now = Date.now() }) {
  if (retentionDays == null || retentionDays <= 0) return 0;
  const cutoff = now - retentionDays * DAY_MS;
  return deleteOlderThan(cutoff);
}
