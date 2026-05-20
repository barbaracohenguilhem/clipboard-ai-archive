const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?\d[\d\s().-]{7,}\d$/;
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_HSL_RE = /^(rgb|rgba|hsl|hsla)\s*\([^)]+\)$/i;

const CODE_KEYWORDS =
  /\b(function|def|import|export|class|const|let|var|return|public|private|if|else|for|while|=>|require)\b/;

function looksLikeCode(text) {
  const lines = text.split('\n');
  let score = 0;
  if (CODE_KEYWORDS.test(text)) score += 2;
  if (lines.length > 1 && lines.some((l) => /^(\s{2,}|\t)/.test(l))) score += 1;
  if (/[{};]/.test(text) && /[(){}[\]]/.test(text)) score += 1;
  const symbolRatio =
    (text.match(/[{}();=<>]/g) || []).length / Math.max(text.length, 1);
  if (symbolRatio > 0.03) score += 1;
  return score >= 3;
}

export function classifyType(text) {
  if (typeof text !== 'string' || text.length === 0) return 'Text';
  const trimmed = text.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      new URL(trimmed);
      return 'URL';
    } catch {
      /* fall through */
    }
  }

  if (EMAIL_RE.test(trimmed)) return 'Email';
  if (PHONE_RE.test(trimmed) && /\d/.test(trimmed)) return 'Phone';
  if (HEX_COLOR_RE.test(trimmed) || RGB_HSL_RE.test(trimmed)) return 'Color';
  if (looksLikeCode(text)) return 'Code';

  return 'Text';
}
