import type { PluginInfo, ProjectContext, TsFileMeta } from '../types/project.js';

/**
 * Vue (non-Nuxt) structure analyzer — focuses on src/ or root conventions.
 */
export function analyzeVueStructure(
  relativePaths: string[],
  tsFiles: TsFileMeta[],
): Pick<
  ProjectContext,
  'routes' | 'layouts' | 'middleware' | 'plugins' | 'composables' | 'stores' | 'server'
> {
  const normalized = relativePaths.map((p) => p.replace(/\\/g, '/'));

  const hasSrc = normalized.some((p) => p.startsWith('src/'));
  const prefix = hasSrc ? 'src/' : '';

  const layouts = normalized.filter((p) => p.startsWith(`${prefix}layouts/`) && p.endsWith('.vue'));
  const middleware = normalized.filter(
    (p) => p.startsWith(`${prefix}middleware/`) && /\.(ts|js)$/.test(p),
  );
  const pluginFiles = normalized.filter(
    (p) => p.startsWith(`${prefix}plugins/`) && /\.(ts|js)$/.test(p),
  );
  const plugins: PluginInfo[] = pluginFiles.map((file) => ({ file, mode: 'unknown' as const }));

  const composables = tsFiles.filter(
    (t) => t.type === 'composable' || t.file.includes('/composables/'),
  );
  const stores = tsFiles.filter(
    (t) => t.type === 'store' || t.file.includes('/stores/') || t.file.includes('/store/'),
  );

  // Vue Router routes are usually code-defined; only list pages/views if present
  const pageLike = normalized.filter(
    (p) =>
      (p.includes('/pages/') || p.includes('/views/')) && /\.(vue|tsx?)$/.test(p),
  );

  const routes = pageLike.map((file) => ({
    file,
    route: file
      .replace(/^src\//, '')
      .replace(/^(pages|views)\//, '/')
      .replace(/\.vue$/, '')
      .replace(/\/index$/, '/')
      .replace(/\[(.+?)\]/g, ':$1'),
    dynamic: /\[.+?\]/.test(file),
  }));

  return {
    routes,
    layouts,
    middleware,
    plugins,
    composables,
    stores,
    server: null,
  };
}
