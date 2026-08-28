import fs from 'node:fs';
import path from 'node:path';
import type {
  CategorizedDependency,
  DependencyCategory,
  Framework,
  PackageMetadata,
} from '../types/project.js';

const CATEGORY_RULES: Array<{ category: DependencyCategory; patterns: RegExp[] }> = [
  {
    category: 'Framework',
    patterns: [/^vue$/, /^nuxt$/, /^@nuxt\//, /^@vue\//],
  },
  {
    category: 'UI',
    patterns: [
      /^vuetify$/,
      /^element-plus$/,
      /^naive-ui$/,
      /^primevue$/,
      /^@headlessui\//,
      /^@nuxt\/ui$/,
      /^daisyui$/,
      /^tailwindcss$/,
      /^@tailwindcss\//,
      /^sass$/,
      /^less$/,
      /^unocss$/,
      /^@unocss\//,
      /^radix-vue$/,
      /^reka-ui$/,
      /^shadcn/,
    ],
  },
  {
    category: 'State Management',
    patterns: [/^pinia$/, /^vuex$/, /^@pinia\//, /^valtio$/, /^zustand$/],
  },
  {
    category: 'Routing',
    patterns: [/^vue-router$/, /^@nuxtjs\/router$/],
  },
  {
    category: 'HTTP/API',
    patterns: [
      /^axios$/,
      /^ofetch$/,
      /^ky$/,
      /^@tanstack\/vue-query$/,
      /^swrv$/,
      /^graphql$/,
      /^@apollo\//,
      /^urql$/,
      /^trpc/,
      /^@trpc\//,
    ],
  },
  {
    category: 'Validation',
    patterns: [/^zod$/, /^yup$/, /^joi$/, /^valibot$/, /^vee-validate$/, /^@vee-validate\//],
  },
  {
    category: 'Testing',
    patterns: [
      /^vitest$/,
      /^jest$/,
      /^cypress$/,
      /^playwright$/,
      /^@playwright\//,
      /^@vue\/test-utils$/,
      /^@nuxt\/test-utils$/,
      /^testing-library/,
    ],
  },
  {
    category: 'Build',
    patterns: [
      /^vite$/,
      /^webpack$/,
      /^rollup$/,
      /^esbuild$/,
      /^typescript$/,
      /^vue-tsc$/,
      /^@vitejs\//,
      /^unplugin-/,
      /^postcss$/,
      /^autoprefixer$/,
      /^eslint/,
      /^prettier/,
      /^@nuxt\/devtools$/,
      /^nitro$/,
      /^nitropack$/,
    ],
  },
];

const NOTABLE = [
  'pinia',
  'vue-router',
  'axios',
  'ofetch',
  'tailwindcss',
  '@nuxt/ui',
  'vuetify',
  'element-plus',
  'naive-ui',
  'zod',
  'vee-validate',
  '@vueuse/core',
  'vueuse',
  'i18n',
  '@nuxtjs/i18n',
  'nuxt-auth',
  '@sidebase/nuxt-auth',
  'prisma',
  '@prisma/client',
];

function categorize(name: string): DependencyCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((re) => re.test(name))) return rule.category;
  }
  return 'Other';
}

function detectPackageManager(root: string): string | null {
  if (fs.existsSync(path.join(root, 'bun.lock')) || fs.existsSync(path.join(root, 'bun.lockb'))) {
    return 'bun';
  }
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root, 'package-lock.json'))) return 'npm';
  return null;
}

export function analyzePackage(
  root: string,
  pkg: Record<string, unknown>,
  framework: Framework,
  frameworkVersion: string | null,
): PackageMetadata {
  const dependencies = (pkg.dependencies as Record<string, string> | undefined) ?? {};
  const devDependencies = (pkg.devDependencies as Record<string, string> | undefined) ?? {};
  const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};

  const categorized: CategorizedDependency[] = [];

  for (const [name, version] of Object.entries(dependencies)) {
    categorized.push({ name, version, category: categorize(name), isDev: false });
  }
  for (const [name, version] of Object.entries(devDependencies)) {
    categorized.push({ name, version, category: categorize(name), isDev: true });
  }

  categorized.sort((a, b) => a.name.localeCompare(b.name));

  const allNames = new Set([...Object.keys(dependencies), ...Object.keys(devDependencies)]);
  const notableLibraries = NOTABLE.filter((n) => {
    if (allNames.has(n)) return true;
    return [...allNames].some((d) => d.includes(n));
  });

  return {
    name: typeof pkg.name === 'string' ? pkg.name : path.basename(root),
    packageManager: detectPackageManager(root),
    scripts,
    framework,
    frameworkVersion,
    dependencies: categorized,
    notableLibraries: [...new Set(notableLibraries)],
  };
}
