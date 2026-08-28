import type {
  ApiEndpoint,
  CapabilityFinding,
  PackageMetadata,
  ProjectCapabilities,
  RouteInfo,
  TsFileMeta,
} from '../types/project.js';

function detected(...evidence: string[]): CapabilityFinding {
  const e = evidence.filter(Boolean);
  return { status: 'detected', evidence: e };
}

function undetected(): CapabilityFinding {
  return { status: 'undetected', evidence: [] };
}

function depNames(pkg: PackageMetadata): string[] {
  return pkg.dependencies.map((d) => d.name);
}

function hasDep(names: string[], ...patterns: Array<string | RegExp>): string[] {
  const hits: string[] = [];
  for (const name of names) {
    for (const p of patterns) {
      if (typeof p === 'string' ? name === p || name.includes(p) : p.test(name)) {
        hits.push(name);
        break;
      }
    }
  }
  return hits;
}

function pathPresent(relativePaths: string[], marker: string): boolean {
  return relativePaths.some((p) => {
    const n = p.replace(/\\/g, '/');
    return n === marker || n.startsWith(`${marker}/`) || n.includes(`/${marker}/`);
  });
}

/**
 * Discover which directories actually exist in the scanned tree.
 * Does not assume Nuxt/Vue conventions — only reports what is present.
 */
export function discoverPresentDirectories(relativePaths: string[]): string[] {
  const interesting = [
    'app',
    'src',
    'pages',
    'views',
    'components',
    'layouts',
    'composables',
    'hooks',
    'stores',
    'store',
    'plugins',
    'middleware',
    'server',
    'services',
    'api',
    'utils',
    'helpers',
    'lib',
    'types',
    'models',
    'entities',
    'assets',
    'public',
    'router',
    'i18n',
    'locales',
  ];
  const found = new Set<string>();
  for (const p of relativePaths) {
    const parts = p.replace(/\\/g, '/').split('/');
    for (const part of parts) {
      if (interesting.includes(part)) found.add(part);
    }
    // also top-level
    if (parts[0] && interesting.includes(parts[0])) found.add(parts[0]);
  }
  return [...found].sort();
}

/**
 * Capability detector — Detection > Assumption.
 * Each finding is either detected with evidence, or explicitly undetected.
 */
export function detectCapabilities(input: {
  pkg: PackageMetadata;
  relativePaths: string[];
  routes: RouteInfo[];
  stores: TsFileMeta[];
  apiSurface: ApiEndpoint[];
  hasTypeScriptFiles: boolean;
}): ProjectCapabilities {
  const names = depNames(input.pkg);
  const paths = input.relativePaths.map((p) => p.replace(/\\/g, '/'));
  const dirs = discoverPresentDirectories(paths);

  // Framework
  const framework =
    input.pkg.framework === 'nuxt'
      ? detected(`nuxt${input.pkg.frameworkVersion ? ` ${input.pkg.frameworkVersion}` : ''}`)
      : detected(`vue${input.pkg.frameworkVersion ? ` ${input.pkg.frameworkVersion}` : ''}`);

  // TypeScript
  const tsDeps = hasDep(names, 'typescript', 'vue-tsc');
  const typescript =
    tsDeps.length || input.hasTypeScriptFiles
      ? detected(...tsDeps, input.hasTypeScriptFiles ? '`.ts`/`.tsx` files present' : '')
      : undetected();

  // Routing
  const vueRouter = hasDep(names, 'vue-router');
  const hasPages = dirs.includes('pages');
  const hasViews = dirs.includes('views');
  const hasRouterDir = dirs.includes('router');
  const routingEvidence: string[] = [];
  if (input.pkg.framework === 'nuxt' && hasPages) {
    routingEvidence.push('Nuxt file-based `pages/`');
  }
  if (vueRouter.length) routingEvidence.push(...vueRouter);
  if (hasViews) routingEvidence.push('`views/` directory');
  if (hasRouterDir) routingEvidence.push('`router/` directory');
  if (input.routes.length) routingEvidence.push(`${input.routes.length} route(s) extracted`);
  const routing = routingEvidence.length ? detected(...routingEvidence) : undetected();

  // State
  const stateDeps = hasDep(names, /^pinia$/, /^@pinia\//, /^vuex$/);
  const stateEvidence = [...stateDeps];
  if (input.stores.length) stateEvidence.push(`${input.stores.length} store file(s)`);
  if (dirs.includes('stores')) stateEvidence.push('`stores/` present');
  if (dirs.includes('store')) stateEvidence.push('`store/` present');
  const stateManagement = stateEvidence.length ? detected(...[...new Set(stateEvidence)]) : undetected();

  // HTTP / API
  const httpDeps = hasDep(
    names,
    'axios',
    'ofetch',
    'ky',
    '@tanstack/vue-query',
    'swrv',
    /^@apollo\//,
    'graphql',
    /^trpc/,
    /^@trpc\//,
  );
  const httpEvidence = [...httpDeps];
  if (pathPresent(paths, 'server/api') || paths.some((p) => p.includes('server/api/'))) {
    httpEvidence.push('`server/api`');
  }
  if (paths.some((p) => p.includes('server/routes/'))) httpEvidence.push('`server/routes`');
  if (dirs.includes('services')) httpEvidence.push('`services/`');
  if (dirs.includes('api') && !httpEvidence.some((e) => e.includes('server/api'))) {
    httpEvidence.push('`api/`');
  }
  if (input.apiSurface.length) httpEvidence.push(`${input.apiSurface.length} endpoint(s) extracted`);
  const clients = [...new Set(input.apiSurface.map((e) => e.client).filter(Boolean))] as string[];
  for (const c of clients) httpEvidence.push(`client usage: ${c}`);
  const httpApi = httpEvidence.length ? detected(...[...new Set(httpEvidence)]) : undetected();

  // i18n
  const i18nDeps = hasDep(names, 'i18n', 'vue-i18n', '@nuxtjs/i18n');
  const i18nEvidence = [...i18nDeps];
  if (dirs.includes('i18n') || dirs.includes('locales')) {
    i18nEvidence.push(dirs.includes('i18n') ? '`i18n/`' : '`locales/`');
  }
  const i18n = i18nEvidence.length ? detected(...i18nEvidence) : undetected();

  // UI library (component libs — not CSS)
  const uiDeps = hasDep(
    names,
    'vuetify',
    'element-plus',
    'naive-ui',
    'primevue',
    '@nuxt/ui',
    '@headlessui',
    'radix-vue',
    'reka-ui',
    'daisyui',
  );
  const uiLibrary = uiDeps.length ? detected(...uiDeps) : undetected();

  // CSS framework
  const cssDeps = hasDep(names, 'tailwindcss', '@tailwindcss', 'unocss', '@unocss', 'sass', 'less', 'bootstrap');
  const cssFramework = cssDeps.length ? detected(...cssDeps) : undetected();

  // PWA
  const pwaDeps = hasDep(names, 'vite-plugin-pwa', '@vite-pwa', 'nuxt-pwa', '@nuxtjs/pwa');
  const pwa = pwaDeps.length ? detected(...pwaDeps) : undetected();

  // Authentication — only from known packages, never from folder name guesses
  const authDeps = hasDep(
    names,
    '@sidebase/nuxt-auth',
    'nuxt-auth',
    '@nuxtjs/auth',
    'next-auth',
    '@auth/',
  );
  const authentication = authDeps.length ? detected(...authDeps) : undetected();

  // Validation
  const valDeps = hasDep(names, 'zod', 'yup', 'joi', 'valibot', 'vee-validate', '@vee-validate');
  const validation = valDeps.length ? detected(...valDeps) : undetected();

  return {
    framework,
    typescript,
    routing,
    stateManagement,
    httpApi,
    i18n,
    uiLibrary,
    cssFramework,
    pwa,
    authentication,
    validation,
    presentDirectories: dirs,
  };
}
