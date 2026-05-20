export const DEFAULT_BLOCKLIST = [
  '1password.com',
  'lastpass.com',
  'bitwarden.com',
  'dashlane.com',
  'keepersecurity.com',
];

const API_KEY_PATTERNS = [
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bghp_[A-Za-z0-9]{36}\b/,
  /\bxox[bpsa]-[A-Za-z0-9-]+\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const OTP_CONTEXT_RE = /verify|code|auth|login|otp|2fa|one[- ]?time/i;

function passesLuhn(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function looksLikePassword(text) {
  if (text.length < 8 || text.length > 64) return false;
  if (/\s/.test(text)) return false;
  const hasUpper = /[A-Z]/.test(text);
  const hasLower = /[a-z]/.test(text);
  const hasDigit = /\d/.test(text);
  const hasSymbol = /[^A-Za-z0-9]/.test(text);
  return hasUpper && hasLower && hasDigit && hasSymbol;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function looksLikeSecret({
  text,
  sourceUrl = null,
  sourceTitle = '',
  blocklist = DEFAULT_BLOCKLIST,
} = {}) {
  if (typeof text !== 'string' || text.length === 0) return false;

  const host = sourceUrl ? hostnameOf(sourceUrl) : null;
  if (host && blocklist.some((d) => host === d || host.endsWith('.' + d))) {
    return true;
  }

  const trimmed = text.trim();

  if (/^\d{6,8}$/.test(trimmed) && OTP_CONTEXT_RE.test(sourceTitle || '')) {
    return true;
  }

  for (const re of API_KEY_PATTERNS) {
    if (re.test(trimmed)) return true;
  }

  if (JWT_RE.test(trimmed) && trimmed.length > 30) return true;

  const digitsOnly = trimmed.replace(/[\s-]/g, '');
  if (/^\d{13,19}$/.test(digitsOnly) && passesLuhn(digitsOnly)) {
    return true;
  }

  if (looksLikePassword(trimmed)) return true;

  return false;
}
