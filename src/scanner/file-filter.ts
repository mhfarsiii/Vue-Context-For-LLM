import path from 'node:path';

/** Directories skipped entirely during walk */
export const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.nuxt',
  '.output',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.turbo',
  '.vercel',
  '.netlify',
  '.idea',
  '.vscode',
  '__pycache__',
]);

/** File extensions treated as binary / non-text */
export const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.bmp',
  '.avif',
  '.mp4',
  '.webm',
  '.mov',
  '.mp3',
  '.wav',
  '.ogg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.wasm',
  '.map',
]);

/** Highlighted top-level / framework dirs */
export const HIGHLIGHT_DIRS = new Set([
  'components',
  'pages',
  'layouts',
  'composables',
  'stores',
  'store',
  'plugins',
  'middleware',
  'server',
  'utils',
  'helpers',
  'services',
  'types',
  'assets',
  'public',
  'app',
]);

const ENV_EXAMPLE_NAMES = new Set([
  '.env.example',
  'env.example',
  '.env.sample',
  '.env.template',
]);

export function isEnvExample(fileName: string): boolean {
  return ENV_EXAMPLE_NAMES.has(fileName);
}

export function isEnvFile(fileName: string): boolean {
  if (isEnvExample(fileName)) return false;
  return fileName === '.env' || fileName.startsWith('.env.');
}

export function isLockFile(fileName: string): boolean {
  return (
    fileName.endsWith('.lock') ||
    fileName === 'package-lock.json' ||
    fileName === 'pnpm-lock.yaml' ||
    fileName === 'yarn.lock' ||
    fileName === 'bun.lock' ||
    fileName === 'bun.lockb'
  );
}

export function isBinaryPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export function matchGlob(relativePath: string, pattern: string): boolean {
  // Minimal glob: ** / * and exact suffix/prefix
  const normalized = relativePath.replace(/\\/g, '/');
  const escaped = pattern
    .replace(/\\/g, '/')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(.+/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  const re = new RegExp(`^${escaped}$`);
  return re.test(normalized);
}

export interface FilterOptions {
  extraExclude?: string[];
  extraInclude?: string[];
}

export type FilterReason =
  | 'ok'
  | 'skip-dir'
  | 'env'
  | 'lock'
  | 'binary'
  | 'exclude-pattern'
  | 'outside-include';

export function classifyPath(
  relativePath: string,
  isDirectory: boolean,
  options: FilterOptions = {},
): FilterReason {
  const normalized = relativePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const base = parts[parts.length - 1] ?? '';

  for (const part of parts) {
    if (SKIP_DIRS.has(part)) return 'skip-dir';
  }

  if (options.extraExclude?.length) {
    for (const pattern of options.extraExclude) {
      if (matchGlob(normalized, pattern) || matchGlob(base, pattern)) {
        return 'exclude-pattern';
      }
    }
  }

  if (options.extraInclude?.length && !isDirectory) {
    const included = options.extraInclude.some(
      (pattern) => matchGlob(normalized, pattern) || matchGlob(base, pattern),
    );
    // include only narrows analyzable content when provided as file globs;
    // directories still walked so nested matches work
    if (!included) {
      // Don't block directory walking; only mark files outside include
      // when include patterns look like file filters (contain . or *)
      const looksLikeFileFilter = options.extraInclude.some(
        (p) => p.includes('.') || p.includes('*'),
      );
      if (looksLikeFileFilter) return 'outside-include';
    }
  }

  if (isDirectory) return 'ok';

  if (isEnvFile(base)) return 'env';
  if (isLockFile(base)) return 'lock';
  if (isBinaryPath(normalized)) return 'binary';

  return 'ok';
}

export function shouldSkipDirectory(dirName: string): boolean {
  return SKIP_DIRS.has(dirName);
}
