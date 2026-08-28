import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { ApiEndpoint, HttpMethod, TsFileMeta } from '../types/project.js';

const METHOD_FROM_SUFFIX: Record<string, HttpMethod> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  head: 'HEAD',
  options: 'OPTIONS',
};

const BUILTIN_HTTP_CLIENTS = new Set([
  '$fetch',
  'ofetch',
  'useFetch',
  'useLazyFetch',
  'fetch',
  'axios',
  'ky',
]);

function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}

/**
 * Map Nuxt server file to HTTP method + path when structure is present.
 * Never invents routes for projects without server/.
 */
export function serverFileToEndpoint(relativePath: string): ApiEndpoint | null {
  const n = relativePath.replace(/\\/g, '/');
  const apiMatch = n.match(/(?:^|\/)server\/api\/(.+)\.(ts|js|mjs)$/);
  const routeMatch = n.match(/(?:^|\/)server\/routes\/(.+)\.(ts|js|mjs)$/);
  if (!apiMatch && !routeMatch) return null;

  const prefix = apiMatch ? '/api' : '';
  const rest = (apiMatch?.[1] ?? routeMatch?.[1])!;

  let method: HttpMethod = apiMatch ? 'UNKNOWN' : 'GET';
  let routePart = rest;

  const methodSuffix = routePart.match(/^(.*)\.(get|post|put|patch|delete|head|options)$/i);
  if (methodSuffix) {
    routePart = methodSuffix[1]!;
    method = METHOD_FROM_SUFFIX[methodSuffix[2]!.toLowerCase()] ?? 'UNKNOWN';
  } else if (apiMatch) {
    method = 'UNKNOWN';
  }

  const segments = routePart
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      if (seg === '[...]' || /^\[\.\.\..+\]$/.test(seg)) return '**';
      const optional = seg.match(/^\[\[(.+)\]\]$/);
      if (optional) return `:${optional[1]}?`;
      const dyn = seg.match(/^\[(.+)\]$/);
      if (dyn) return `:${dyn[1]}`;
      if (seg === 'index') return '';
      return seg;
    })
    .filter(Boolean);

  const pathStr = `${prefix}/${segments.join('/')}`.replace(/\/+/g, '/') || '/';

  return {
    method,
    path: pathStr,
    sourceFile: n,
    usedBy: [],
    requestType: null,
    responseType: null,
    client: 'nuxt-server',
  };
}

interface ClientCall {
  method: HttpMethod;
  path: string;
  sourceFile: string;
  caller: string | null;
  responseType: string | null;
  client: string;
}

function inferCallerLabel(relativePath: string, tsFiles: TsFileMeta[]): string | null {
  const n = relativePath.replace(/\\/g, '/');
  const meta = tsFiles.find((t) => t.file === n);
  if (meta?.composableName) return `${meta.composableName}()`;
  if (meta?.storeName) return `${meta.storeName}()`;
  if (n.includes('/composables/') || n.startsWith('composables/') || n.includes('/hooks/') || n.startsWith('hooks/')) {
    const base = path.basename(n).replace(/\.(ts|js)$/, '');
    if (/^use[A-Z]/.test(base)) return `${base}()`;
  }
  if (
    n.includes('/store/') ||
    n.includes('/stores/') ||
    n.startsWith('store/') ||
    n.startsWith('stores/')
  ) {
    return path.basename(n).replace(/\.(ts|js)$/, '');
  }
  if (n.includes('/services/') || n.startsWith('services/') || n.includes('/api/') || n.startsWith('api/')) {
    return path.basename(n).replace(/\.(ts|js)$/, '');
  }
  // Vue SFCs: use component file name so call-sites in <script> still attribute
  if (n.endsWith('.vue')) {
    return path.basename(n, '.vue');
  }
  return null;
}

function extractMethodFromOptions(arg: ts.Expression | undefined): HttpMethod {
  if (!arg || !ts.isObjectLiteralExpression(arg)) return 'UNKNOWN';
  for (const prop of arg.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
      prop.name.text === 'method'
    ) {
      if (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer)) {
        const m = prop.initializer.text.toUpperCase();
        if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(m)) {
          return m as HttpMethod;
        }
      }
    }
  }
  return 'UNKNOWN';
}

function typeArgName(node: ts.CallExpression): string | null {
  const ta = node.typeArguments?.[0];
  if (!ta) return null;
  if (ts.isTypeReferenceNode(ta) && ts.isIdentifier(ta.typeName)) {
    return ta.typeName.text;
  }
  return null;
}

/**
 * Extract path from string literal OR simple template `/x/${id}` → `/x/:id`.
 * Dynamic templates with expressions beyond identifiers are omitted.
 */
export function extractPathExpression(expr: ts.Expression): string | null {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return normalizePathLiteral(expr.text);
  }
  if (ts.isTemplateExpression(expr)) {
    let out = expr.head.text;
    for (const span of expr.templateSpans) {
      const id = span.expression;
      if (!ts.isIdentifier(id) && !ts.isPropertyAccessExpression(id)) {
        return null; // too dynamic — omit
      }
      const name = ts.isIdentifier(id)
        ? id.text
        : ts.isIdentifier(id.name)
          ? id.name.text
          : 'param';
      out += `:${name}${span.literal.text}`;
    }
    return normalizePathLiteral(out);
  }
  return null;
}

function normalizePathLiteral(raw: string): string | null {
  if (!raw || raw.includes('${')) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      return new URL(raw).pathname;
    } catch {
      return null;
    }
  }
  if (raw.startsWith('/')) return raw.replace(/\/{2,}/g, '/') || '/';
  if (/^(api|v\d+)\//i.test(raw)) return `/${raw}`;
  return null;
}

/**
 * Accept API-like paths generously once a real HTTP client/wrapper is involved.
 * Still skip empty / root-only navigations.
 */
function isConfidentApiPath(
  pathStr: string,
  client: string,
  _method: HttpMethod,
  wrappers: Set<string>,
): boolean {
  if (!pathStr || pathStr === '/') return false;
  // Known HTTP clients / discovered wrappers → keep absolute or api-relative paths
  if (BUILTIN_HTTP_CLIENTS.has(client) || wrappers.has(client) || client === 'typed-catalog' || client === 'nuxt-server') {
    return pathStr.startsWith('/') || /^(api|v\d+)\//i.test(pathStr);
  }
  // Other custom clients (api.get, http.post): keep absolute paths
  if (pathStr.startsWith('/')) return true;
  return false;
}

/** Parse "GET /products" or "POST /cart/:id" style endpoint keys/args */
function parseMethodPathString(raw: string): { method: HttpMethod; path: string } | null {
  const m = raw.trim().match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/\S+)$/i);
  if (!m) return null;
  return {
    method: m[1]!.toUpperCase() as HttpMethod,
    path: m[2]!,
  };
}

interface CalleeInfo {
  client: string;
  methodHint: HttpMethod;
  pathArgIndex: number;
  optionsArgIndex: number | null;
}

function resolveCallee(expr: ts.Expression, wrappers: Set<string>): CalleeInfo | null {
  if (ts.isIdentifier(expr)) {
    const name = expr.text;
    if (name === '$fetch' || name === 'ofetch') {
      return { client: name === 'ofetch' ? 'ofetch' : '$fetch', methodHint: 'UNKNOWN', pathArgIndex: 0, optionsArgIndex: 1 };
    }
    if (name === 'useFetch' || name === 'useLazyFetch') {
      return { client: name, methodHint: 'GET', pathArgIndex: 0, optionsArgIndex: 1 };
    }
    if (name === 'fetch') {
      return { client: 'fetch', methodHint: 'GET', pathArgIndex: 0, optionsArgIndex: 1 };
    }
    if (wrappers.has(name)) {
      // Custom API helpers like apiFetch('/cart', { method: 'GET' })
      // Default GET when method omitted (common wrapper convention); still recorded as detected client
      return { client: name, methodHint: 'GET', pathArgIndex: 0, optionsArgIndex: 1 };
    }
    return null;
  }

  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
    const methodName = expr.name.text.toLowerCase();
    const httpVerb = METHOD_FROM_SUFFIX[methodName];
    if (httpVerb) {
      let client = 'custom-client';
      if (ts.isIdentifier(expr.expression)) {
        const obj = expr.expression.text;
        if (obj === 'axios') client = 'axios';
        else if (obj === 'ky') client = 'ky';
        else client = obj;
      }
      return { client, methodHint: httpVerb, pathArgIndex: 0, optionsArgIndex: 1 };
    }
    if (methodName === 'request' && ts.isIdentifier(expr.expression) && expr.expression.text === 'axios') {
      return { client: 'axios', methodHint: 'UNKNOWN', pathArgIndex: -1, optionsArgIndex: 0 };
    }
  }

  return null;
}

/**
 * Resolve first-arg endpoint: `/path`, `/path/:id`, or `GET /path`.
 */
function resolveEndpointArg(
  expr: ts.Expression | undefined,
): { method: HttpMethod | null; path: string } | null {
  if (!expr) return null;

  // Plain string / simple template
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    const raw = expr.text.trim();
    const mp = parseMethodPathString(raw);
    if (mp) return mp;
    const pathOnly = normalizePathLiteral(raw);
    return pathOnly ? { method: null, path: pathOnly } : null;
  }

  if (ts.isTemplateExpression(expr)) {
    const pathOnly = extractPathExpression(expr);
    return pathOnly ? { method: null, path: pathOnly } : null;
  }

  return null;
}

function callerFromStack(fnStack: string[], fileFallback: string | null): string | null {
  const enclosing = fnStack[fnStack.length - 1];
  if (!enclosing) return fileFallback;
  if (/^use[A-Z]/.test(enclosing)) return `${enclosing}()`;
  // Skip anonymous-looking names
  if (enclosing === 'anonymous') return fileFallback;
  return enclosing;
}

function functionContainsHttpClient(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const expr = n.expression;
      if (ts.isIdentifier(expr) && BUILTIN_HTTP_CLIENTS.has(expr.text)) {
        found = true;
        return;
      }
      if (
        ts.isPropertyAccessExpression(expr) &&
        ts.isIdentifier(expr.expression) &&
        (expr.expression.text === 'axios' || expr.expression.text === 'ky')
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function hasExportModifier(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

/**
 * Discover project API wrappers: exported functions that call $fetch/axios/ofetch/fetch.
 * Detection-only — no hard-coded names like apiFetch.
 */
export function discoverApiWrappers(
  files: Array<{ absolutePath: string; relativePath: string }>,
): Set<string> {
  const wrappers = new Set<string>();

  for (const f of files) {
    const n = f.relativePath.replace(/\\/g, '/');
    if (!/\.(ts|js|mjs)$/.test(n) || n.endsWith('.d.ts')) continue;
    // Focus on likely client modules; still works elsewhere
    let content: string;
    try {
      content = fs.readFileSync(f.absolutePath, 'utf8');
    } catch {
      continue;
    }
    if (content.length > 200_000) continue;
    // Quick prefilter
    if (!/\b(\$fetch|ofetch|useFetch|axios|fetch)\b/.test(content)) continue;

    const sf = ts.createSourceFile(f.absolutePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    const consider = (name: string, body: ts.Node) => {
      if (functionContainsHttpClient(body)) wrappers.add(name);
    };

    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name && hasExportModifier(node) && node.body) {
        consider(node.name.text, node.body);
      }
      if (ts.isVariableStatement(node) && hasExportModifier(node)) {
        for (const d of node.declarationList.declarations) {
          if (!ts.isIdentifier(d.name) || !d.initializer) continue;
          if (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) {
            consider(d.name.text, d.initializer);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  return wrappers;
}

/**
 * Extract endpoints from typed API catalogs like:
 *   interface ApiEndpoints { 'GET /cart': {...}; 'PUT /cart/:id': {...} }
 * Generic pattern — any interface/type with METHOD + path keys.
 */
export function extractTypedApiCatalog(
  files: Array<{ absolutePath: string; relativePath: string }>,
): ApiEndpoint[] {
  const out: ApiEndpoint[] = [];
  const keyRe = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/\S+)$/;

  for (const f of files) {
    const n = f.relativePath.replace(/\\/g, '/');
    if (!(/\.(ts|d\.ts)$/.test(n) && (n.includes('/types/') || n.startsWith('types/') || n.endsWith('.d.ts')))) {
      continue;
    }
    let content: string;
    try {
      content = fs.readFileSync(f.absolutePath, 'utf8');
    } catch {
      continue;
    }
    if (content.length > 500_000) continue;

    const sf = ts.createSourceFile(f.absolutePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    const visit = (node: ts.Node) => {
      if (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) {
        const members = ts.isInterfaceDeclaration(node) ? node.members : node.members;
        let hits = 0;
        const batch: ApiEndpoint[] = [];
        for (const m of members) {
          if (!ts.isPropertySignature(m) || !m.name) continue;
          const name =
            ts.isStringLiteral(m.name) || ts.isIdentifier(m.name) ? m.name.text : null;
          if (!name) continue;
          const match = name.match(keyRe);
          if (!match) continue;
          hits++;
          batch.push({
            method: match[1] as HttpMethod,
            path: match[2]!,
            sourceFile: n,
            usedBy: [],
            requestType: null,
            responseType: null,
            client: 'typed-catalog',
          });
        }
        // Only treat as catalog if at least one METHOD /path key
        if (hits >= 1) out.push(...batch);
      }
      // type ApiEndpoints = { 'GET /x': ... }
      if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) {
        // handled via TypeLiteral visit of children — but TypeLiteral is visited as child
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  return out;
}

function pathFromAxiosRequestConfig(arg: ts.Expression | undefined): { path: string; method: HttpMethod } | null {
  if (!arg || !ts.isObjectLiteralExpression(arg)) return null;
  let url: string | null = null;
  let method: HttpMethod = 'UNKNOWN';
  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    if (prop.name.text === 'url') {
      const resolved = resolveEndpointArg(prop.initializer);
      if (resolved) {
        url = resolved.path;
        if (resolved.method) method = resolved.method;
      }
    }
    if (prop.name.text === 'method' && ts.isStringLiteral(prop.initializer)) {
      const m = prop.initializer.text.toUpperCase();
      if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(m)) {
        method = m as HttpMethod;
      }
    }
  }
  if (!url) return null;
  return { path: url, method };
}

function collectClientCalls(
  absolutePath: string,
  relativePath: string,
  tsFiles: TsFileMeta[],
  wrappers: Set<string>,
): ClientCall[] {
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return [];
  }
  if (content.length > 300_000) return [];

  let source = content;
  if (relativePath.endsWith('.vue')) {
    // Concatenate all <script> blocks (setup + normal)
    const scripts = [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1] ?? '');
    if (!scripts.length) return [];
    source = scripts.join('\n');
  }

  const sf = ts.createSourceFile(
    absolutePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const calls: ClientCall[] = [];
  const fileFallback = inferCallerLabel(relativePath, tsFiles);
  const fnStack: string[] = [];

  const visit = (node: ts.Node) => {
    let pushed: string | null = null;
    if (ts.isFunctionDeclaration(node) && node.name) {
      pushed = node.name.text;
      fnStack.push(pushed);
    } else if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
        ) {
          pushed = d.name.text;
          fnStack.push(pushed);
          break;
        }
      }
    } else if (
      (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
      node.parent &&
      ts.isVariableDeclaration(node.parent) &&
      ts.isIdentifier(node.parent.name)
    ) {
      // already handled via VariableStatement
    }

    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'axios') {
        const endpoint = resolveEndpointArg(node.arguments[0]);
        const optMethod = extractMethodFromOptions(node.arguments[1]);
        const caller = callerFromStack(fnStack, fileFallback);
        if (endpoint && isConfidentApiPath(endpoint.path, 'axios', optMethod, wrappers)) {
          calls.push({
            method: optMethod !== 'UNKNOWN' ? optMethod : endpoint.method ?? 'UNKNOWN',
            path: endpoint.path,
            sourceFile: relativePath.replace(/\\/g, '/'),
            caller,
            responseType: typeArgName(node),
            client: 'axios',
          });
        }
      }

      const callee = resolveCallee(node.expression, wrappers);
      if (callee) {
        const caller = callerFromStack(fnStack, fileFallback);

        if (callee.pathArgIndex === -1) {
          const fromCfg = pathFromAxiosRequestConfig(node.arguments[0]);
          if (fromCfg && isConfidentApiPath(fromCfg.path, callee.client, fromCfg.method, wrappers)) {
            calls.push({
              method: fromCfg.method !== 'UNKNOWN' ? fromCfg.method : callee.methodHint,
              path: fromCfg.path,
              sourceFile: relativePath.replace(/\\/g, '/'),
              caller,
              responseType: typeArgName(node),
              client: callee.client,
            });
          }
        } else {
          const endpoint = resolveEndpointArg(node.arguments[callee.pathArgIndex]);
          const optMethod =
            callee.optionsArgIndex != null
              ? extractMethodFromOptions(node.arguments[callee.optionsArgIndex])
              : 'UNKNOWN';
          let method: HttpMethod =
            optMethod !== 'UNKNOWN'
              ? optMethod
              : endpoint?.method
                ? endpoint.method
                : callee.methodHint !== 'UNKNOWN'
                  ? callee.methodHint
                  : 'UNKNOWN';
          if (endpoint && isConfidentApiPath(endpoint.path, callee.client, method, wrappers)) {
            calls.push({
              method,
              path: endpoint.path,
              sourceFile: relativePath.replace(/\\/g, '/'),
              caller,
              responseType: typeArgName(node),
              client: callee.client,
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
    if (pushed) fnStack.pop();
  };

  visit(sf);
  return calls;
}

function normalizePathForMatch(p: string): string {
  return p.replace(/:\w+\?/g, ':param').replace(/:\w+/g, ':param').replace(/\/\*\*$/, '/**');
}

function pathsCompatible(a: string, b: string): boolean {
  const na = normalizePathForMatch(a);
  const nb = normalizePathForMatch(b);
  if (na === nb) return true;
  if (na.endsWith('/**') && nb.startsWith(na.slice(0, -3))) return true;
  if (nb.endsWith('/**') && na.startsWith(nb.slice(0, -3))) return true;
  return false;
}

export function analyzeApiSurface(
  files: Array<{ absolutePath: string; relativePath: string }>,
  tsFiles: TsFileMeta[],
): ApiEndpoint[] {
  const byKey = new Map<string, ApiEndpoint>();

  const upsert = (ep: ApiEndpoint) => {
    // Dedupe by method+path (prefer richer usedBy / client)
    const key = `${ep.method} ${ep.path}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, ep);
      return;
    }
    existing.usedBy = unique([...existing.usedBy, ...ep.usedBy]);
    existing.requestType = existing.requestType ?? ep.requestType;
    existing.responseType = existing.responseType ?? ep.responseType;
    // Prefer more specific client over catch-all nuxt-server proxy
    if (existing.client === 'nuxt-server' && ep.client && ep.client !== 'nuxt-server') {
      existing.client = ep.client;
      existing.sourceFile = ep.sourceFile;
    } else if (!existing.client && ep.client) {
      existing.client = ep.client;
    }
    // Prefer call-site source when catalog has no callers yet and this adds callers
    if (ep.usedBy.length && existing.sourceFile.endsWith('.d.ts') && !ep.sourceFile.endsWith('.d.ts')) {
      existing.sourceFile = ep.sourceFile;
    }
  };

  // 1) Nuxt server handlers
  for (const f of files) {
    const n = f.relativePath.replace(/\\/g, '/');
    if (!n.includes('server/')) continue;
    if (!/\.(ts|js|mjs)$/.test(n)) continue;
    const ep = serverFileToEndpoint(n);
    if (ep) upsert(ep);
  }

  // 2) Typed API catalog (METHOD /path keys)
  for (const ep of extractTypedApiCatalog(files)) {
    upsert(ep);
  }

  // 3) Discover custom wrappers then scan call sites
  const wrappers = discoverApiWrappers(files);

  const clientFiles = files.filter((f) => {
    const n = f.relativePath.replace(/\\/g, '/');
    if (!/\.(ts|js|vue)$/.test(n)) return false;
    return !n.endsWith('.d.ts');
  });

  const clientCalls: ClientCall[] = [];
  for (const f of clientFiles) {
    clientCalls.push(...collectClientCalls(f.absolutePath, f.relativePath, tsFiles, wrappers));
  }

  for (const call of clientCalls) {
    let matched = false;
    for (const ep of byKey.values()) {
      const methodOk =
        call.method === 'UNKNOWN' || ep.method === 'UNKNOWN' || call.method === ep.method;
      // Don't attach random calls onto catch-all proxy /**
      const isCatchAll = ep.path.endsWith('/**');
      if (!isCatchAll && pathsCompatible(ep.path, call.path) && methodOk) {
        if (call.caller) ep.usedBy = unique([...ep.usedBy, call.caller]);
        if (call.responseType) ep.responseType = ep.responseType ?? call.responseType;
        if (ep.method === 'UNKNOWN' && call.method !== 'UNKNOWN') ep.method = call.method;
        if (call.client) ep.client = ep.client === 'typed-catalog' ? call.client : (ep.client ?? call.client);
        matched = true;
      }
    }

    if (!matched) {
      upsert({
        method: call.method,
        path: call.path,
        sourceFile: call.sourceFile,
        usedBy: call.caller ? [call.caller] : [],
        requestType: null,
        responseType: call.responseType,
        client: call.client,
      });
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const methodOrder = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'UNKNOWN'];
    const mi = methodOrder.indexOf(a.method);
    const mj = methodOrder.indexOf(b.method);
    if (mi !== mj) return mi - mj;
    return a.path.localeCompare(b.path);
  });
}
