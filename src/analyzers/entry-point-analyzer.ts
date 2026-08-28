import type {
  ApiEndpoint,
  ComponentMeta,
  EntryPointMap,
  EntryPointNode,
  TsFileMeta,
} from '../types/project.js';

function findExistingRoot(
  components: ComponentMeta[],
  relativePaths: string[],
  appDir: string | null,
): { id: string; kind: 'app' | 'main' } | null {
  const paths = new Set(relativePaths.map((p) => p.replace(/\\/g, '/')));
  const componentFiles = new Set(components.map((c) => c.file));

  const appCandidates = [
    appDir ? `${appDir}/app.vue` : null,
    'app.vue',
    'src/App.vue',
    'App.vue',
    'src/app.vue',
  ].filter(Boolean) as string[];

  for (const c of appCandidates) {
    if (componentFiles.has(c) || paths.has(c)) return { id: c, kind: 'app' };
  }

  // Also accept any scanned *app.vue / *App.vue
  for (const f of componentFiles) {
    if (f.endsWith('/app.vue') || f.endsWith('/App.vue') || f === 'app.vue' || f === 'App.vue') {
      return { id: f, kind: 'app' };
    }
  }

  const mainCandidates = [
    'main.ts',
    'main.js',
    'src/main.ts',
    'src/main.js',
    'app/main.ts',
    'index.ts',
    'src/index.ts',
  ];
  for (const m of mainCandidates) {
    if (paths.has(m)) return { id: m, kind: 'main' };
  }

  return null;
}

/**
 * Compact entry-point map from what actually exists.
 * If no root entry is found → detected: false, no invented paths.
 */
export function buildEntryPointMap(input: {
  appDir: string | null;
  relativePaths: string[];
  components: ComponentMeta[];
  layouts: string[];
  middleware: string[];
  routes: Array<{ file: string; route: string }>;
  composables: TsFileMeta[];
  stores: TsFileMeta[];
  apiSurface: ApiEndpoint[];
}): EntryPointMap {
  const { components, layouts, middleware, routes, stores, apiSurface, appDir, relativePaths } =
    input;
  const nodes: EntryPointNode[] = [];
  const summaryLines: string[] = [];

  const root = findExistingRoot(components, relativePaths, appDir);
  if (!root) {
    return {
      roots: [],
      nodes: [],
      summaryLines: ['(entry root undetected — no app.vue / App.vue / main.ts found)'],
      detected: false,
    };
  }

  const globalMiddleware = middleware.filter((m) => m.includes('.global.'));
  const otherMiddleware = middleware.filter((m) => !m.includes('.global.')).slice(0, 6);

  const defaultLayout =
    layouts.find((l) => /\/default\.vue$/.test(l) || l.endsWith('default.vue')) ??
    layouts[0] ??
    null;

  const pageComponents = components.filter((c) => c.type === 'page');
  const featuredPages = pickFeaturedPages(pageComponents, routes);

  const appChildren: string[] = [];
  for (const m of globalMiddleware) appChildren.push(m);
  if (defaultLayout) appChildren.push(defaultLayout);
  for (const p of featuredPages) appChildren.push(p.file);

  nodes.push({ id: root.id, kind: root.kind, children: appChildren });
  summaryLines.push(root.id);

  if (globalMiddleware.length) {
    summaryLines.push('→ global middleware:');
    for (const m of globalMiddleware) {
      summaryLines.push(`    ${m}`);
      nodes.push({ id: m, kind: 'middleware', children: [] });
    }
  } else if (otherMiddleware.length) {
    summaryLines.push('→ middleware:');
    for (const m of otherMiddleware.slice(0, 4)) {
      summaryLines.push(`    ${m}`);
      nodes.push({ id: m, kind: 'middleware', children: [] });
    }
  }

  if (defaultLayout) {
    const layoutMeta = components.find((c) => c.file === defaultLayout);
    const layoutChildren = [
      ...(layoutMeta?.localComponents.slice(0, 5) ?? []),
      ...(layoutMeta?.stores.slice(0, 3) ?? []),
    ];
    nodes.push({ id: defaultLayout, kind: 'layout', children: layoutChildren });
    summaryLines.push(`→ layout: ${defaultLayout}`);
    for (const ch of layoutChildren.slice(0, 4)) summaryLines.push(`    ├── ${ch}`);
  }

  if (featuredPages.length) {
    summaryLines.push('→ pages / views (representative):');
    for (const page of featuredPages) {
      const route = routes.find((r) => r.file === page.file)?.route ?? '';
      const children: string[] = [];
      for (const lc of page.localComponents.slice(0, 4)) children.push(lc);
      for (const s of page.stores.slice(0, 3)) children.push(s);
      const meaningfulComposables = page.composables.filter((c) => !isBuiltin(c)).slice(0, 3);
      for (const c of meaningfulComposables) children.push(c);

      const relatedApi = apiSurface
        .filter((ep) =>
          ep.usedBy.some((u) =>
            [...page.stores, ...meaningfulComposables].some(
              (x) => u.replace(/\(\)$/, '') === x.replace(/\(\)$/, ''),
            ),
          ),
        )
        .slice(0, 2);
      for (const ep of relatedApi) children.push(`${ep.method} ${ep.path}`);

      nodes.push({ id: page.file, kind: 'page', children });
      summaryLines.push(`    ${page.file}${route ? `  (${route})` : ''}`);
      children.slice(0, 5).forEach((ch, i, arr) => {
        summaryLines.push(`      ${i === arr.length - 1 ? '└──' : '├──'} ${ch}`);
      });
    }
  } else if (!routes.length) {
    summaryLines.push('→ routes: undetected');
  }

  if (stores.length) {
    summaryLines.push('→ state:');
    for (const s of stores.slice(0, 8)) {
      const label = s.storeName ? `${s.storeName} (${s.file})` : s.file;
      summaryLines.push(`    ${label}`);
      nodes.push({
        id: s.file,
        kind: 'store',
        children: s.imports
          .filter((i) => i.startsWith('~/') || i.startsWith('@/') || i.startsWith('.'))
          .slice(0, 4),
      });
    }
  }

  return {
    roots: [root.id],
    nodes,
    summaryLines,
    detected: true,
  };
}

function pickFeaturedPages(
  pages: ComponentMeta[],
  routes: Array<{ file: string; route: string }>,
): ComponentMeta[] {
  if (!pages.length) return [];
  const byFile = new Map(pages.map((p) => [p.file, p]));
  const picked: ComponentMeta[] = [];

  const index = pages.find((p) => /(?:^|\/)pages\/index\.vue$/.test(p.file) || /(?:^|\/)views\/index\.vue$/.test(p.file));
  if (index) picked.push(index);

  const ranked = [...pages]
    .filter((p) => p !== index)
    .sort((a, b) => scorePage(b) - scorePage(a));

  for (const p of ranked) {
    if (picked.length >= 6) break;
    picked.push(p);
  }

  for (const r of routes) {
    if (picked.length >= 8) break;
    const depth = r.route.split('/').filter(Boolean).length;
    if (depth <= 1) {
      const page = byFile.get(r.file);
      if (page && !picked.includes(page)) picked.push(page);
    }
  }

  return picked.slice(0, 8);
}

function scorePage(p: ComponentMeta): number {
  return (
    p.localComponents.length * 3 +
    p.stores.length * 4 +
    p.composables.filter((c) => !isBuiltin(c)).length * 2
  );
}

function isBuiltin(name: string): boolean {
  return [
    'useRoute()',
    'useRouter()',
    'useNuxtApp()',
    'useRuntimeConfig()',
    'useState()',
    'useCookie()',
    'useFetch()',
    'useAsyncData()',
    'useHead()',
    'useSeoMeta()',
    'useI18n()',
  ].includes(name);
}
