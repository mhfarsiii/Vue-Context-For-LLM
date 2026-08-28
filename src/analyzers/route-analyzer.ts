import path from 'node:path';
import type { RouteInfo } from '../types/project.js';

/**
 * Map Nuxt file-based routing path to URL route.
 * Supports: index, [id], [[id]], [...slug], [[...slug]], (groups)
 */
export function filePathToRoute(relativeFile: string): RouteInfo {
  const normalized = relativeFile.replace(/\\/g, '/');
  // Strip pages/ prefix if present
  let routePath = normalized.replace(/^.*\/?pages\//, '').replace(/^pages\//, '');
  routePath = routePath.replace(/\.(vue|tsx?|jsx?)$/, '');

  // Drop route groups: (marketing)/about → about
  const segments = routePath.split('/').filter((seg) => !(seg.startsWith('(') && seg.endsWith(')')));

  let dynamic = false;
  const mapped = segments
    .map((seg) => {
      if (seg === 'index') return '';
      // optional catch-all [[...slug]]
      const optCatch = seg.match(/^\[\[\.\.\.(.+)\]\]$/);
      if (optCatch) {
        dynamic = true;
        return `:${optCatch[1]}(.*)*`;
      }
      // catch-all [...slug]
      const catchAll = seg.match(/^\[\.\.\.(.+)\]$/);
      if (catchAll) {
        dynamic = true;
        return `:${catchAll[1]}(.*)*`;
      }
      // optional [[id]]
      const optional = seg.match(/^\[\[(.+)\]\]$/);
      if (optional) {
        dynamic = true;
        return `:${optional[1]}?`;
      }
      // dynamic [id]
      const dyn = seg.match(/^\[(.+)\]$/);
      if (dyn) {
        dynamic = true;
        return `:${dyn[1]}`;
      }
      return seg;
    })
    .filter((s) => s !== '');

  const route = '/' + mapped.join('/');
  return {
    file: normalized,
    route: route === '/' ? '/' : route.replace(/\/+/g, '/'),
    dynamic,
  };
}

export function extractRoutes(pageFiles: string[]): RouteInfo[] {
  return pageFiles
    .filter((f) => {
      const n = f.replace(/\\/g, '/');
      return /\.(vue|tsx?|jsx?)$/.test(n) && (n.startsWith('pages/') || n.includes('/pages/'));
    })
    .map(filePathToRoute)
    .sort((a, b) => a.route.localeCompare(b.route));
}

export function findPageFiles(relativePaths: string[], appDir: string | null): string[] {
  return relativePaths.filter((f) => {
    const n = f.replace(/\\/g, '/');
    if (appDir) {
      return n.startsWith(`${appDir}/pages/`) || n === `${appDir}/pages`;
    }
    return n.startsWith('pages/') || (!n.includes('/') && false);
  });
}

export function pluginModeFromFilename(fileName: string): 'client' | 'server' | 'both' | 'unknown' {
  const base = path.basename(fileName);
  if (base.includes('.client.')) return 'client';
  if (base.includes('.server.')) return 'server';
  return 'both';
}
