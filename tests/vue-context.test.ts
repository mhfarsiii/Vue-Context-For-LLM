import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateProjectContext } from '../src/index.js';
import { FrameworkDetectError, detectFramework } from '../src/analyzers/framework-detector.js';
import { filePathToRoute } from '../src/analyzers/route-analyzer.js';
import { serverFileToEndpoint } from '../src/analyzers/api-surface-analyzer.js';
import { scanProject } from '../src/scanner/project-scanner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, 'fixtures');

function fixture(name: string) {
  return path.join(fixtures, name);
}

function generate(name: string, focus?: string, mode: 'context' | 'docs' = 'context') {
  return generateProjectContext({
    projectPath: fixture(name),
    output: mode === 'docs' ? '.ai/project-overview.md' : '.ai/project-context.md',
    mode,
    verbose: false,
    dryRun: true,
    exclude: [],
    include: [],
    focus: focus ?? null,
  });
}

describe('framework detection', () => {
  it('detects Nuxt', () => {
    const d = detectFramework(fixture('nuxt-app'));
    expect(d.framework).toBe('nuxt');
  });

  it('detects Vue without Nuxt', () => {
    expect(detectFramework(fixture('vue-vite')).framework).toBe('vue');
  });

  it('fails when no vue/nuxt deps', () => {
    expect(() => detectFramework(fixture('no-package'))).toThrow(FrameworkDetectError);
  });

  it('fails when package.json missing', () => {
    expect(() => detectFramework(fixture('missing-package'))).toThrow(/package\.json/);
  });
});

describe('routes', () => {
  it('maps static and dynamic routes', () => {
    expect(filePathToRoute('pages/products/[id].vue').route).toBe('/products/:id');
    expect(filePathToRoute('pages/blog/[slug].vue').dynamic).toBe(true);
  });
});

describe('capabilities (detection > assumption)', () => {
  it('reports undetected for missing concerns on minimal Vue', () => {
    const result = generate('vue-minimal');
    expect(result.context.framework).toBe('vue');
    expect(result.context.capabilities.stateManagement.status).toBe('undetected');
    expect(result.context.capabilities.i18n.status).toBe('undetected');
    expect(result.context.capabilities.authentication.status).toBe('undetected');
    expect(result.context.capabilities.pwa.status).toBe('undetected');
    expect(result.markdown).toContain('## Capabilities');
    expect(result.markdown).toMatch(/\*\*State management:\*\* undetected/);
    // Must not invent Nuxt server/pages conventions
    expect(result.markdown).not.toContain('Server routes under `server/api`');
    expect(result.context.routes).toEqual([]);
    expect(result.context.stores).toEqual([]);
  });

  it('detects Nuxt capabilities from evidence', () => {
    const result = generate('nuxt-app');
    expect(result.context.capabilities.framework.status).toBe('detected');
    expect(result.context.capabilities.routing.status).toBe('detected');
    expect(result.context.capabilities.stateManagement.status).toBe('detected');
    expect(result.context.capabilities.httpApi.status).toBe('detected');
  });
});

describe('API surface', () => {
  it('maps server api files to method + path', () => {
    const ep = serverFileToEndpoint('server/api/products/[id].get.ts');
    expect(ep?.method).toBe('GET');
    expect(ep?.path).toBe('/api/products/:id');

    const post = serverFileToEndpoint('server/api/products/index.post.ts');
    expect(post?.method).toBe('POST');
    expect(post?.path).toBe('/api/products');
  });

  it('extracts endpoints and callers from nuxt fixture', () => {
    const result = generate('nuxt-app');
    const paths = result.context.apiSurface.map((e) => `${e.method} ${e.path}`);

    expect(paths.some((p) => p.includes('GET /api/products/:id'))).toBe(true);
    expect(paths.some((p) => p.includes('POST /api/products'))).toBe(true);
    expect(result.markdown).toContain('## API Surface');

    const list = result.context.apiSurface.find((e) => e.path === '/api/products' && e.method === 'GET');
    expect(list?.usedBy.some((u) => u.includes('useProductList'))).toBe(true);
  });

  it('extracts axios calls from Vue projects', () => {
    const result = generate('vue-vite');
    const paths = result.context.apiSurface.map((e) => `${e.method} ${e.path}`);
    expect(paths.some((p) => p.includes('/api/items'))).toBe(true);
  });

  it('extracts GET/PUT/POST from custom apiFetch wrappers', () => {
    const result = generate('nuxt-app');
    const paths = result.context.apiSurface.map((e) => `${e.method} ${e.path}`);
    expect(paths).toEqual(expect.arrayContaining([
      'GET /cart',
      'POST /cart',
      'PUT /cart/:itemId',
    ]));
  });
});

describe('domain types', () => {
  it('keeps structural domain types and omits utilities', () => {
    const result = generate('nuxt-app');
    const names = result.context.domainTypes.map((t) => t.name);

    expect(names).toContain('Product');
    expect(names).toContain('Cart');
    expect(names).toContain('ProductVariant');
    expect(names).not.toContain('Maybe');
    expect(names).not.toContain('ButtonProps');

    const product = result.context.domainTypes.find((t) => t.name === 'Product');
    expect(product?.fields).toEqual(expect.arrayContaining(['id', 'name', 'price']));
    expect(product?.references).toContain('ProductVariant');
    expect(result.markdown).toContain('## Domain Model');
  });
});

describe('entry points', () => {
  it('builds an app → layout/pages map when app.vue exists', () => {
    const result = generate('nuxt-app');
    expect(result.context.entryPoints.detected).toBe(true);
    expect(result.context.entryPoints.summaryLines.length).toBeGreaterThan(0);
    expect(result.markdown).toContain('## Entry Points');
    expect(result.context.entryPoints.roots.some((r) => r.includes('app.vue'))).toBe(true);
  });

  it('uses App.vue or main.js for minimal Vue without inventing pages', () => {
    const result = generate('vue-minimal');
    expect(result.context.entryPoints.detected).toBe(true);
    expect(
      result.context.entryPoints.roots.some(
        (r) => r.includes('App.vue') || r.includes('main.js') || r.includes('main.ts'),
      ),
    ).toBe(true);
    expect(result.context.routes).toEqual([]);
  });
});

describe('focus', () => {
  it('filters context by generic keyword matching', () => {
    const result = generate('nuxt-app', 'checkout');
    expect(result.context.focus).toBe('checkout');
    expect(result.markdown).toContain('_Focus: `checkout`_');
    expect(result.context.routes.some((r) => r.route.includes('checkout'))).toBe(true);
    expect(result.context.components.some((c) => c.file.includes('Checkout'))).toBe(true);
    expect(result.context.routes.some((r) => r.route.includes('blog'))).toBe(false);
  });

  it('supports path focus', () => {
    const result = generate('nuxt-app', 'pages/products/[id].vue');
    expect(result.context.routes.some((r) => r.file.includes('products/[id]'))).toBe(true);
  });

  it('supports store filename keyword focus', () => {
    const result = generate('nuxt-app', 'cart');
    expect(result.context.stores.some((s) => s.file.includes('cart'))).toBe(true);
  });
});

describe('scanner exclusions', () => {
  it('skips node_modules and .env', () => {
    const scanNm = scanProject(fixture('with-node-modules'));
    expect(scanNm.analyzed.every((f) => !f.relativePath.includes('node_modules'))).toBe(true);

    const scanEnv = scanProject(fixture('with-env'));
    expect(scanEnv.analyzed.some((f) => f.relativePath === '.env')).toBe(false);
  });
});

describe('nuxt project generation', () => {
  it('generates upgraded markdown sections', () => {
    const result = generate('nuxt-app');
    expect(result.markdown).toMatch(/^# Project Context/m);
    expect(result.markdown).toContain('## Overview');
    expect(result.markdown).toContain('## Capabilities');
    expect(result.markdown).toContain('## Stack');
    expect(result.markdown).toContain('## Conventions');
    expect(result.markdown).toContain('## Entry Points');
    expect(result.markdown).toContain('## Routes');
    expect(result.markdown).toContain('## API Surface');
    expect(result.markdown).toContain('## Domain Model');
    expect(result.markdown).toContain('/products/:id');
    expect(result.markdown).not.toContain('sk-live-super-secret');

    const card = result.context.components.find((c) => c.file.endsWith('ProductCard.vue'));
    expect(card?.props).toContain('product');
    expect(card?.emits).toContain('add-to-cart');
  });
});

describe('vue project generation', () => {
  it('still works for Vue + Vite', () => {
    const result = generate('vue-vite');
    expect(result.context.framework).toBe('vue');
    expect(result.markdown).toContain('## Overview');
    expect(result.markdown).toContain('## Capabilities');
  });
});

describe('env safety', () => {
  it('does not leak secrets', () => {
    const result = generate('with-env');
    expect(result.markdown).not.toContain('sk-live-super-secret-value');
    expect(result.markdown).not.toContain('postgres://user:password');
  });
});

describe('docs mode (non-technical overview)', () => {
  it('generates fully separated English then Farsi sections', () => {
    const result = generate('nuxt-app', undefined, 'docs');
    expect(result.markdown).toMatch(/^# Project Overview\n/m);
    expect(result.markdown).toContain('# نمای کلی پروژه');
    expect(result.markdown).toContain('## What this project is');
    expect(result.markdown).toContain('## این پروژه چیست');
    expect(result.markdown).toContain('## What it can do');
    expect(result.markdown).toContain('## چه کارهایی می‌تواند بکند');
    expect(result.markdown).toContain('## Main screens and paths');
    expect(result.markdown).toContain('## صفحات و مسیرهای اصلی');
    expect(result.markdown).toContain('## Main concepts (business ideas in the code)');
    expect(result.markdown).toContain('## مفاهیم اصلی (ایده‌های کسب‌وکار در کد)');
    expect(result.markdown).toContain('## How data moves (server / API calls)');
    expect(result.markdown).toContain('## داده‌ها چگونه جابه‌جا می‌شوند (سرور / API)');
    expect(result.markdown).toContain('Product');
    expect(result.markdown).toMatch(/Fetches or lists data from/);
    expect(result.markdown).toMatch(/داده را می‌گیرد یا فهرست می‌کند از/);
    // English block comes before Farsi block
    const enIdx = result.markdown.indexOf('# Project Overview');
    const faIdx = result.markdown.indexOf('# نمای کلی پروژه');
    expect(enIdx).toBeGreaterThanOrEqual(0);
    expect(faIdx).toBeGreaterThan(enIdx);
    expect(result.markdown).not.toContain('## What this project is / این پروژه چیست');
    expect(result.markdown).not.toContain('## Capabilities');
    expect(result.markdown).not.toContain('## Stack');
    expect(result.markdown).not.toContain('sk-live-super-secret');
  });

  it('does not invent routes on minimal Vue', () => {
    const result = generate('vue-minimal', undefined, 'docs');
    expect(result.markdown).toContain('No page routes were detected');
    expect(result.markdown).toContain('مسیری برای صفحات پیدا نشد');
  });

  it('respects focus in docs mode', () => {
    const result = generate('nuxt-app', 'cart', 'docs');
    expect(result.markdown).toContain('_Currently focused on: `cart`_');
    expect(result.markdown).toContain('_تمرکز فعلی روی: `cart`_');
  });
});

describe('resilience', () => {
  it('throws controlled error on non-vue projects', () => {
    expect(() => generate('no-package')).toThrow(FrameworkDetectError);
  });
});
