import type {
  ApiEndpoint,
  ComponentMeta,
  DomainType,
  EntryPointMap,
  ProjectContext,
  RouteInfo,
  TsFileMeta,
} from '../types/project.js';

function norm(s: string): string {
  return s.toLowerCase().replace(/\\/g, '/');
}

function focusTokens(focus: string): string[] {
  const raw = focus.trim();
  const n = norm(raw);
  const tokens = new Set<string>();
  tokens.add(n);
  // path-like
  const base = n.split('/').pop()?.replace(/\.(vue|ts|js)$/, '') ?? n;
  if (base) tokens.add(base);
  // strip brackets
  tokens.add(base.replace(/\[|\]/g, ''));
  // keyword without plural
  if (base.endsWith('s') && base.length > 3) tokens.add(base.slice(0, -1));
  return [...tokens].filter((t) => t.length >= 2);
}

function matchesFocus(haystack: string, tokens: string[]): boolean {
  const h = norm(haystack);
  return tokens.some((t) => h.includes(t));
}

/**
 * Filter full context to a focused subgraph.
 * Uses keyword/path/route matching + one trustworthy relationship hop.
 * Weak guesses are omitted.
 */
export function applyFocus(ctx: ProjectContext, focus: string): ProjectContext {
  const tokens = focusTokens(focus);
  if (!tokens.length) return { ...ctx, focus };

  const routeHits = ctx.routes.filter(
    (r) => matchesFocus(r.file, tokens) || matchesFocus(r.route, tokens),
  );

  const componentHits = ctx.components.filter(
    (c) =>
      matchesFocus(c.file, tokens) ||
      (c.name ? matchesFocus(c.name, tokens) : false) ||
      routeHits.some((r) => r.file === c.file),
  );

  const composableHits = ctx.composables.filter(
    (c) =>
      matchesFocus(c.file, tokens) ||
      (c.composableName ? matchesFocus(c.composableName, tokens) : false),
  );

  const storeHits = ctx.stores.filter(
    (s) =>
      matchesFocus(s.file, tokens) ||
      (s.storeName ? matchesFocus(s.storeName, tokens) : false),
  );

  const apiHits = ctx.apiSurface.filter(
    (ep) =>
      matchesFocus(ep.path, tokens) ||
      matchesFocus(ep.sourceFile, tokens) ||
      ep.usedBy.some((u) => matchesFocus(u, tokens)),
  );

  const typeHits = ctx.domainTypes.filter((t) => matchesFocus(t.name, tokens));

  // Expand one hop from component hits via explicit metadata only
  const relatedComponentNames = new Set<string>();
  const relatedComposableNames = new Set<string>();
  const relatedStoreNames = new Set<string>();

  for (const c of componentHits) {
    for (const lc of c.localComponents) relatedComponentNames.add(lc.toLowerCase());
    for (const comp of c.composables) relatedComposableNames.add(comp.replace(/\(\)$/, '').toLowerCase());
    for (const st of c.stores) relatedStoreNames.add(st.replace(/\(\)$/, '').toLowerCase());
  }

  const expandedComponents = ctx.components.filter((c) => {
    if (componentHits.includes(c)) return true;
    const base = (c.name ?? c.file.split('/').pop()?.replace(/\.vue$/, '') ?? '').toLowerCase();
    return relatedComponentNames.has(base);
  });

  const expandedComposables = ctx.composables.filter((c) => {
    if (composableHits.includes(c)) return true;
    const name = (c.composableName ?? '').toLowerCase();
    return name && relatedComposableNames.has(name);
  });

  const expandedStores = ctx.stores.filter((s) => {
    if (storeHits.includes(s)) return true;
    const name = (s.storeName ?? '').toLowerCase();
    return name && relatedStoreNames.has(name);
  });

  // APIs used by expanded composables/stores
  const callerNames = new Set(
    [...expandedComposables, ...expandedStores].flatMap((x) => {
      const labels: string[] = [];
      if (x.composableName) labels.push(`${x.composableName}()`.toLowerCase());
      if (x.storeName) labels.push(`${x.storeName}()`.toLowerCase());
      return labels;
    }),
  );

  const expandedApis = ctx.apiSurface.filter((ep) => {
    if (apiHits.includes(ep)) return true;
    return ep.usedBy.some((u) => callerNames.has(u.toLowerCase()));
  });

  // Domain types referenced by focus name or already hit; expand refs one level
  const typeNames = new Set(typeHits.map((t) => t.name));
  for (const t of typeHits) for (const r of t.references) typeNames.add(r);
  // Also pick types whose names appear in focused file paths (e.g. Product)
  for (const t of ctx.domainTypes) {
    if (matchesFocus(t.name, tokens)) typeNames.add(t.name);
  }
  const expandedTypes = ctx.domainTypes.filter((t) => typeNames.has(t.name));

  const expandedRoutes: RouteInfo[] = ctx.routes.filter(
    (r) =>
      routeHits.includes(r) ||
      expandedComponents.some((c) => c.file === r.file),
  );

  const relatedFiles = new Set([
    ...expandedComponents.map((c) => c.file),
    ...expandedComposables.map((c) => c.file),
    ...expandedStores.map((s) => s.file),
    ...expandedApis.map((a) => a.sourceFile),
    ...expandedRoutes.map((r) => r.file),
  ]);

  const relationships = ctx.relationships.filter(
    (e) =>
      relatedFiles.has(e.from) ||
      matchesFocus(e.from, tokens) ||
      e.to.some((t) => matchesFocus(t, tokens)),
  );

  const layouts = ctx.layouts.filter(
    (l) => matchesFocus(l, tokens) || expandedComponents.some((c) => c.file === l),
  );
  // Always keep default layout if any page hit
  const defaultLayout = ctx.layouts.find((l) => l.endsWith('default.vue'));
  if (expandedRoutes.length && defaultLayout && !layouts.includes(defaultLayout)) {
    layouts.push(defaultLayout);
  }

  const middleware = ctx.middleware.filter((m) => matchesFocus(m, tokens));
  const plugins = ctx.plugins.filter((p) => matchesFocus(p.file, tokens));

  const entryPoints = filterEntryPoints(ctx.entryPoints, tokens, relatedFiles);

  // If nothing matched, return a tiny stub rather than full dump
  const anyHit =
    expandedRoutes.length ||
    expandedComponents.length ||
    expandedComposables.length ||
    expandedStores.length ||
    expandedApis.length ||
    expandedTypes.length;

  if (!anyHit) {
    return {
      ...ctx,
      focus,
      routes: [],
      components: [],
      composables: [],
      stores: [],
      apiSurface: [],
      domainTypes: [],
      relationships: [],
      layouts: [],
      middleware: [],
      plugins: [],
      entryPoints: {
        roots: [],
        nodes: [],
        summaryLines: [`No confident matches for focus "${focus}"`],
        detected: false,
      },
      structure: [],
      server: null,
      importantConfigs: [],
      conventions: ctx.conventions,
    };
  }

  return {
    ...ctx,
    focus,
    routes: expandedRoutes,
    components: expandedComponents,
    composables: expandedComposables,
    stores: expandedStores,
    apiSurface: expandedApis,
    domainTypes: expandedTypes,
    relationships,
    layouts,
    middleware,
    plugins,
    entryPoints,
    // Keep configs/conventions light in focus mode
    structure: [],
    importantConfigs: ctx.importantConfigs.filter((c) =>
      /nuxt\.config|package\.json/.test(c.file),
    ),
    server: ctx.server
      ? {
          api: ctx.server.api.filter((f) => relatedFiles.has(f) || matchesFocus(f, tokens)),
          routes: ctx.server.routes.filter((f) => relatedFiles.has(f) || matchesFocus(f, tokens)),
          middleware: ctx.server.middleware.filter((f) => matchesFocus(f, tokens)),
          plugins: ctx.server.plugins.filter((f) => matchesFocus(f, tokens)),
        }
      : null,
  };
}

function filterEntryPoints(
  map: EntryPointMap,
  tokens: string[],
  relatedFiles: Set<string>,
): EntryPointMap {
  const nodes = map.nodes.filter(
    (n) => relatedFiles.has(n.id) || matchesFocus(n.id, tokens) || n.kind === 'app',
  );
  const ids = new Set(nodes.map((n) => n.id));
  const trimmed = nodes.map((n) => ({
    ...n,
    children: n.children.filter(
      (c) => matchesFocus(c, tokens) || [...relatedFiles].some((f) => norm(f).includes(norm(c))) || ids.has(c),
    ),
  }));

  const summaryLines = map.summaryLines.filter(
    (line) =>
      matchesFocus(line, tokens) ||
      [...relatedFiles].some((f) => line.includes(f)) ||
      line.startsWith('→') ||
      trimmed.some((n) => line.includes(n.id)),
  );

  return {
    roots: map.roots.filter((r) => ids.has(r) || trimmed.some((n) => n.kind === 'app' || n.kind === 'main')),
    nodes: trimmed,
    summaryLines: summaryLines.length ? summaryLines : trimmed.slice(0, 12).map((n) => n.id),
    detected: trimmed.length > 0,
  };
}
