import fs from 'node:fs';
import path from 'node:path';
import type { PluginInfo, ProjectContext, TsFileMeta } from '../types/project.js';
import { pluginModeFromFilename } from './route-analyzer.js';
import { extractRoutes, findPageFiles } from './route-analyzer.js';

function listFilesInDir(
  relativePaths: string[],
  dirPrefixes: string[],
  extensions = ['.vue', '.ts', '.js', '.tsx', '.jsx', '.mjs'],
): string[] {
  return relativePaths
    .filter((f) => {
      const n = f.replace(/\\/g, '/');
      return dirPrefixes.some((p) => n.startsWith(p.endsWith('/') ? p : `${p}/`));
    })
    .filter((f) => extensions.some((ext) => f.endsWith(ext)))
    .sort();
}

function prefixesFor(appDir: string | null, name: string): string[] {
  const prefixes = [`${name}/`];
  if (appDir) prefixes.unshift(`${appDir}/${name}/`);
  return prefixes;
}

export function analyzeNuxtStructure(
  relativePaths: string[],
  appDir: string | null,
  tsFiles: TsFileMeta[],
): Pick<
  ProjectContext,
  'routes' | 'layouts' | 'middleware' | 'plugins' | 'composables' | 'stores' | 'server'
> {
  const pageFiles = findPageFiles(relativePaths, appDir);
  // Also include root pages/ when appDir is set (some hybrid layouts)
  const allPageCandidates = relativePaths.filter((f) => {
    const n = f.replace(/\\/g, '/');
    return /(^|\/)pages\/.+\.(vue|tsx?|jsx?)$/.test(n);
  });
  const routes = extractRoutes(allPageCandidates.length ? allPageCandidates : pageFiles);

  const layouts = listFilesInDir(relativePaths, prefixesFor(appDir, 'layouts'));
  const middleware = listFilesInDir(relativePaths, prefixesFor(appDir, 'middleware'));

  const pluginFiles = listFilesInDir(relativePaths, prefixesFor(appDir, 'plugins'));
  const plugins: PluginInfo[] = pluginFiles.map((file) => ({
    file,
    mode: pluginModeFromFilename(file),
  }));

  const composableFiles = new Set(
    listFilesInDir(relativePaths, prefixesFor(appDir, 'composables'), ['.ts', '.js', '.tsx', '.jsx']),
  );
  const composables = tsFiles.filter((t) => composableFiles.has(t.file) || t.type === 'composable');

  const storeFiles = new Set([
    ...listFilesInDir(relativePaths, prefixesFor(appDir, 'stores'), ['.ts', '.js']),
    ...listFilesInDir(relativePaths, prefixesFor(appDir, 'store'), ['.ts', '.js']),
  ]);
  const stores = tsFiles.filter((t) => storeFiles.has(t.file) || t.type === 'store');

  const server = analyzeServer(relativePaths);

  return {
    routes,
    layouts,
    middleware,
    plugins,
    composables,
    stores,
    server,
  };
}

function analyzeServer(relativePaths: string[]): ProjectContext['server'] {
  const serverFiles = relativePaths.filter((f) => f.replace(/\\/g, '/').startsWith('server/'));
  if (serverFiles.length === 0) return null;

  const pick = (sub: string) =>
    serverFiles.filter((f) => f.replace(/\\/g, '/').startsWith(`server/${sub}/`)).sort();

  return {
    api: pick('api'),
    routes: pick('routes'),
    middleware: pick('middleware'),
    plugins: pick('plugins'),
  };
}

export function readConfigSummaries(
  root: string,
  relativePaths: string[],
): import('../types/project.js').ConfigSummary[] {
  const interesting = [
    'nuxt.config.ts',
    'nuxt.config.js',
    'nuxt.config.mjs',
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mts',
    'vite.config.mjs',
    'tsconfig.json',
    'tailwind.config.ts',
    'tailwind.config.js',
    'tailwind.config.cjs',
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.ts',
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.js',
    '.prettierrc.cjs',
    'prettier.config.js',
    '.cursorrules',
    '.clinerules',
    'README.md',
    'package.json',
  ];

  const summaries: import('../types/project.js').ConfigSummary[] = [];
  const files = new Set(relativePaths.map((p) => p.replace(/\\/g, '/')));

  // Also include .cursor/rules/*
  for (const f of files) {
    if (f.startsWith('.cursor/rules/')) interesting.push(f);
  }

  for (const name of interesting) {
    if (!files.has(name) && !fs.existsSync(path.join(root, name))) continue;
    const abs = path.join(root, name);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;

    let content: string;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }

    summaries.push({
      file: name,
      summary: summarizeConfig(name, content),
    });
  }

  // Deduplicate by file
  const seen = new Set<string>();
  return summaries.filter((s) => {
    if (seen.has(s.file)) return false;
    seen.add(s.file);
    return true;
  });
}

function summarizeConfig(file: string, content: string): string[] {
  const lines: string[] = [];
  const base = path.basename(file);

  if (base === 'package.json') {
    lines.push('Project manifest (see Stack / Dependencies sections)');
    return lines;
  }

  if (base.startsWith('nuxt.config')) {
    const modules = [...content.matchAll(/modules\s*:\s*\[([\s\S]*?)\]/g)];
    if (modules[0]) {
      const mods = [...modules[0][1]!.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]!);
      if (mods.length) lines.push(`modules: ${mods.slice(0, 20).join(', ')}`);
    }
    if (/\bssr\s*:\s*false\b/.test(content)) lines.push('ssr: false');
    if (/\bssr\s*:\s*true\b/.test(content)) lines.push('ssr: true');
    if (/\bdevtools\b/.test(content)) lines.push('devtools configured');
    if (/\bcss\s*:/.test(content)) lines.push('css entries present');
    if (/\bruntimeConfig\b/.test(content)) lines.push('runtimeConfig present (values omitted)');
    if (/\brouteRules\b/.test(content)) lines.push('routeRules present');
    if (lines.length === 0) lines.push('Nuxt config present');
    return lines;
  }

  if (base.startsWith('vite.config')) {
    if (/\bplugins\b/.test(content)) lines.push('Vite plugins configured');
    if (/\balias\b/.test(content)) lines.push('path aliases configured');
    if (/\bserver\b/.test(content)) lines.push('dev server options present');
    if (lines.length === 0) lines.push('Vite config present');
    return lines;
  }

  if (base === 'tsconfig.json') {
    try {
      const json = JSON.parse(content) as {
        compilerOptions?: Record<string, unknown>;
        extends?: string;
      };
      if (json.extends) lines.push(`extends: ${json.extends}`);
      const paths = json.compilerOptions?.paths;
      if (paths && typeof paths === 'object') {
        lines.push(`path aliases: ${Object.keys(paths as object).join(', ')}`);
      }
      if (json.compilerOptions?.strict) lines.push('strict: true');
    } catch {
      lines.push('tsconfig present (unparsed)');
    }
    return lines;
  }

  if (base.startsWith('tailwind.config')) {
    if (/\bcontent\b/.test(content)) lines.push('content paths configured');
    if (/\btheme\b/.test(content)) lines.push('theme customization present');
    if (/\bplugins\b/.test(content)) lines.push('tailwind plugins present');
    if (lines.length === 0) lines.push('Tailwind config present');
    return lines;
  }

  if (base.includes('eslint') || base.includes('prettier') || base.includes('prettierrc')) {
    lines.push('Formatter/linter config present');
    return lines;
  }

  if (base === '.cursorrules' || base === '.clinerules' || file.startsWith('.cursor/rules/')) {
    const preview = content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 15);
    return preview.length ? preview : ['Rules file present'];
  }

  if (base === 'README.md') {
    const firstHeading = content.split('\n').find((l) => l.startsWith('#'));
    if (firstHeading) lines.push(firstHeading.replace(/^#+\s*/, '').trim());
    lines.push(`README length: ${content.length} chars (content not inlined)`);
    return lines;
  }

  lines.push('Config file present');
  return lines;
}

export function collectConventions(root: string, relativePaths: string[]): string[] {
  const conventions: string[] = [];
  const files = relativePaths.map((p) => p.replace(/\\/g, '/'));

  for (const f of files) {
    if (f === '.cursorrules' || f === '.clinerules' || f.startsWith('.cursor/rules/')) {
      conventions.push(f);
    }
  }

  // Also check existence even if filtered oddly
  for (const name of ['.cursorrules', '.clinerules']) {
    if (fs.existsSync(path.join(root, name)) && !conventions.includes(name)) {
      conventions.push(name);
    }
  }

  return conventions;
}
