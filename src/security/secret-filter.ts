const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'aws-key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'google-api', re: /AIza[0-9A-Za-z\-_]{35}/g },
  { name: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  {
    name: 'jwt',
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    name: 'generic-assignment',
    re: /\b(api[_-]?key|secret|password|token|access[_-]?key|private[_-]?key)\b\s*[:=]\s*['"][^'"]{8,}['"]/gi,
  },
];

export function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some(({ re }) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

export function redactSecrets(text: string): string {
  let out = text;
  for (const { re } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, '[REDACTED]');
  }
  return out;
}

/** Strip values from .env.example-like content, keep keys only if safe. */
export function summarizeEnvExample(content: string): string[] {
  const keys: string[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key) keys.push(key);
  }
  return keys.slice(0, 40);
}
