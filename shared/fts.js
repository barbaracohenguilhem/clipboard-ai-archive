const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
  'can', 'her', 'was', 'one', 'our', 'out', 'his', 'has',
  'had', 'who', 'this', 'that', 'with', 'from', 'they',
  'will', 'would', 'there', 'their', 'what', 'about',
]);

export function tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const raw = text.toLowerCase().split(/[^a-z0-9]+/);
  const out = new Set();
  for (const t of raw) {
    if (t.length < 3) continue;
    if (STOPWORDS.has(t)) continue;
    out.add(t);
  }
  return [...out];
}
