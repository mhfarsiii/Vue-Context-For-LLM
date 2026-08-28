import type {
  ApiEndpoint,
  ComponentMeta,
  DependencyCategory,
  DomainType,
  ProjectContext,
  TsFileMeta,
} from '../types/project.js';
import { redactSecrets } from '../security/secret-filter.js';
import {
  buildConventionLines,
  renderCapabilitiesSection,
} from '../analyzers/convention-analyzer.js';

const CATEGORY_ORDER: DependencyCategory[] = [
  'Framework',
  'UI',
  'State Management',
  'Routing',
  'HTTP/API',
  'Validation',
  'Testing',
  'Build',
  'Other',
];

const BUILTIN_COMPOSABLES = new Set([
  'useRoute()',
  'useRouter()',
  'useNuxtApp()',
  'useRuntimeConfig()',
  'useState()',
  'useCookie()',
  'useFetch()',
  'useAsyncData()',
  'useLazyFetch()',
  'useLazyAsyncData()',
  'useHead()',
  'useSeoMeta()',
  'useRequestHeaders()',
  'useRequestURL()',
  'useError()',
  'useAppConfig()',
  'useSlots()',
  'useAttrs()',
  'useId()',
  'useModel()',
  'useCssModule()',
  'useI18n()',
  'useLocalePath()',
  'useSwitchLocalePath()',
  'useDevice()',
  'useColorMode()',
]);

function renderComponent(c: ComponentMeta): string {
  const composables = c.composables.filter((x) => !BUILTIN_COMPOSABLES.has(x));
  const bits: string[] = [`**${c.file}** (${c.type}${c.scriptSetup ? ', setup' : ''})`];
  if (c.localComponents.length) bits.push(`imports: ${c.localComponents.join(', ')}`);
  if (composables.length) bits.push(`composables: ${composables.join(', ')}`);
  if (c.stores.length) bits.push(`stores: ${c.stores.join(', ')}`);
  if (c.props.length) bits.push(`props: ${c.props.join(', ')}`);
  if (c.emits.length) bits.push(`emits: ${c.emits.join(', ')}`);
  if (c.slots.length) bits.push(`slots: ${c.slots.join(', ')}`);
  if (c.usesRouting) bits.push('routing: yes');
  if (bits.length === 1 && c.type === 'page') {
    return `- **${c.file}** (page${c.scriptSetup ? ', setup' : ''})`;
  }
  return `- ${bits.join(' | ')}`;
}

function renderTs(t: TsFileMeta): string {
  const label = labelTsType(t);
  const parts: string[] = [`**${t.file}** (${label})`];
  const exports = [
    ...t.exports.slice(0, 12),
    ...t.exportInterfaces.slice(0, 8).map((x) => `interface ${x}`),
    ...t.exportTypes.slice(0, 8).map((x) => `type ${x}`),
    ...t.exportClasses.slice(0, 4).map((x) => `class ${x}`),
  ];
  if (exports.length) parts.push(`exports: ${exports.join(', ')}`);
  const localImports = t.imports
    .filter((i) => i.startsWith('.') || i.startsWith('~/') || i.startsWith('@/'))
    .slice(0, 8);
  if (localImports.length) parts.push(`imports: ${localImports.join(', ')}`);
  return `- ${parts.join(' | ')}`;
}

function labelTsType(t: TsFileMeta): string {
  if (t.type === 'store') return t.storeName ? `Pinia Store (${t.storeName})` : 'Store';
  if (t.type === 'composable') return t.composableName ? `Composable (${t.composableName})` : 'Composable';
  return t.type.charAt(0).toUpperCase() + t.type.slice(1);
}

function selectComponentsForOutput(components: ComponentMeta[]): ComponentMeta[] {
  const pages = components.filter((c) => c.type === 'page');
  const layouts = components.filter((c) => c.type === 'layout');
  const rich = components.filter(
    (c) =>
      c.type === 'component' &&
      (c.localComponents.length > 0 || c.stores.length > 0 || c.composables.length > 0),
  );
  const selected = [...pages, ...layouts, ...rich.slice(0, 30)];
  const seen = new Set<string>();
  return selected.filter((c) => {
    if (seen.has(c.file)) return false;
    seen.add(c.file);
    return true;
  });
}

function renderComponentIndex(components: ComponentMeta[]): string[] {
  const byDir = new Map<string, string[]>();
  for (const c of components) {
    const parts = c.file.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    const name = parts[parts.length - 1]!;
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(name);
  }
  const lines: string[] = [];
  for (const dir of [...byDir.keys()].sort()) {
    const files = byDir.get(dir)!.sort();
    lines.push(`- \`${dir}/\`: ${files.join(', ')}`);
  }
  return lines;
}

function renderApiEndpoint(ep: ApiEndpoint): string[] {
  const method = ep.method === 'UNKNOWN' ? '*' : ep.method;
  const lines = [`${method} ${ep.path}`];
  lines.push(`  Source: ${ep.sourceFile}`);
  if (ep.client) lines.push(`  Client: ${ep.client}`);
  if (ep.usedBy.length) lines.push(`  Used by: ${ep.usedBy.join(', ')}`);
  if (ep.requestType) lines.push(`  Request: ${ep.requestType}`);
  if (ep.responseType) lines.push(`  Response: ${ep.responseType}`);
  return lines;
}

function renderApiSurfaceSection(endpoints: ApiEndpoint[]): string[] {
  if (!endpoints.length) {
    return ['## API Surface', '', '_No API endpoints detected_', ''];
  }

  const order: Array<ApiEndpoint['method']> = [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'HEAD',
    'OPTIONS',
    'UNKNOWN',
  ];

  const lines: string[] = ['## API Surface', ''];

  // Summary — make method coverage obvious
  const counts = order
    .map((m) => {
      const n = endpoints.filter((e) => e.method === m).length;
      if (!n) return null;
      const label = m === 'UNKNOWN' ? '*' : m;
      return `${label}: ${n}`;
    })
    .filter(Boolean);
  lines.push(`_Total: ${endpoints.length} endpoints (${counts.join(' · ')})_`, '');

  for (const method of order) {
    const group = endpoints.filter((e) => e.method === method);
    if (!group.length) continue;
    const label = method === 'UNKNOWN' ? '*' : method;
    lines.push(`### ${label} (${group.length})`, '', '```text');
    for (const ep of group) {
      lines.push(...renderApiEndpoint(ep));
      lines.push('');
    }
    lines.push('```', '');
  }

  return lines;
}

function renderDomainType(t: DomainType): string[] {
  const lines = [`### ${t.name}`, '', `- Kind: ${t.kind}`, `- File: \`${t.file}\``];
  if (t.fields.length) lines.push(`- Fields: ${t.fields.join(', ')}`);
  if (t.references.length) lines.push(`- References: ${t.references.join(', ')}`);
  lines.push('');
  return lines;
}

function buildConventions(ctx: ProjectContext): string[] {
  return buildConventionLines(ctx);
}

export function generateMarkdown(ctx: ProjectContext): string {
  const sections: string[] = [];
  const pkg = ctx.package;
  const focused = Boolean(ctx.focus);

  sections.push('# Project Context', '');
  if (focused) {
    sections.push(`_Focus: \`${ctx.focus}\`_`, '');
  }

  // Overview
  sections.push('## Overview', '');
  sections.push(
    `- **Name:** ${pkg.name}`,
    `- **Framework:** ${pkg.framework}${pkg.frameworkVersion ? ` (${pkg.frameworkVersion})` : ''}`,
    `- **Package manager:** ${pkg.packageManager ?? 'unknown'}`,
  );
  if (!focused) sections.push(`- **Root:** \`${ctx.root}\``);
  if (ctx.appDir) sections.push(`- **App directory:** \`${ctx.appDir}/\``);
  if (pkg.notableLibraries.length) {
    sections.push(`- **Notable libraries:** ${pkg.notableLibraries.join(', ')}`);
  }
  sections.push('');

  // Capabilities (detection-first)
  if (!focused) {
    sections.push(...renderCapabilitiesSection(ctx.capabilities));
  }

  // Stack
  sections.push('## Stack', '');
  if (ctx.capabilities.framework.status === 'detected') {
    sections.push(`- ${ctx.capabilities.framework.evidence.join(', ')}`);
  } else {
    sections.push('- Framework: undetected');
  }
  for (const key of [
    'typescript',
    'cssFramework',
    'stateManagement',
    'routing',
  ] as const) {
    const f = ctx.capabilities[key];
    if (f.status === 'detected') {
      sections.push(`- ${f.evidence[0]}`);
    }
  }
  sections.push('');

  if (!focused) {
    // Compact deps — Framework + State + HTTP only in overview stack companion
    const notableCats: DependencyCategory[] = [
      'Framework',
      'State Management',
      'Routing',
      'HTTP/API',
      'UI',
    ];
    sections.push('### Key dependencies', '');
    for (const category of notableCats) {
      const items = pkg.dependencies.filter((d) => d.category === category);
      if (!items.length) continue;
      sections.push(
        `- **${category}:** ${items.map((d) => `\`${d.name}\``).join(', ')}`,
      );
    }
    const otherCount = pkg.dependencies.filter((d) => d.category === 'Other').length;
    if (otherCount) sections.push(`- **Other:** ${otherCount} packages (omitted)`);
    sections.push('');
  }

  // Conventions
  const conventionLines = buildConventions(ctx);
  if (conventionLines.length) {
    sections.push('## Conventions', '');
    sections.push(...conventionLines);
    sections.push('');
  }

  // Entry Points
  if (ctx.entryPoints.summaryLines.length) {
    sections.push('## Entry Points', '', '```text');
    sections.push(...ctx.entryPoints.summaryLines);
    sections.push('```', '');
  }

  // Routes — only if detected
  if (ctx.routes.length) {
    sections.push('## Routes', '', '```text');
    for (const r of ctx.routes) {
      const dyn = r.dynamic ? '  (dynamic)' : '';
      sections.push(`${r.file.padEnd(40)} → ${r.route}${dyn}`);
    }
    sections.push('```', '');
  } else if (!focused && ctx.capabilities.routing.status === 'undetected') {
    sections.push('## Routes', '', '_Routing undetected_', '');
  }

  // API Surface — full list, grouped by method (no caps)
  sections.push(...renderApiSurfaceSection(ctx.apiSurface));

  // Domain Model
  if (ctx.domainTypes.length) {
    sections.push('## Domain Model', '');
    const types = focused ? ctx.domainTypes : ctx.domainTypes.slice(0, 40);
    for (const t of types) sections.push(...renderDomainType(t));
    if (!focused && ctx.domainTypes.length > 40) {
      sections.push(`_… ${ctx.domainTypes.length - 40} more domain types omitted_`, '');
    }
  } else if (!focused) {
    sections.push('## Domain Model', '', '_No domain types detected_', '');
  }

  // Components
  const comps = selectComponentsForOutput(ctx.components);
  if (ctx.components.length) {
    sections.push('## Components', '');
    sections.push(`_Total: ${ctx.components.length} Vue SFCs_`, '');
    if (!focused) {
      sections.push('### Index', '');
      sections.push(...renderComponentIndex(ctx.components));
      sections.push('');
    } else {
      for (const c of ctx.components) sections.push(`- \`${c.file}\` (${c.type})`);
      sections.push('');
    }
    if (comps.length) {
      sections.push('### Details', '');
      for (const c of comps) sections.push(renderComponent(c));
      sections.push('');
    }
  }

  // Composables
  if (ctx.composables.length) {
    sections.push('## Composables', '');
    for (const c of ctx.composables) sections.push(renderTs(c));
    sections.push('');
  }

  // Stores
  if (ctx.stores.length) {
    sections.push('## Stores', '');
    for (const s of ctx.stores) sections.push(renderTs(s));
    sections.push('');
  }

  // Architecture relationships
  if (ctx.relationships.length) {
    sections.push('## Architecture Relationships', '', '```text');
    for (const edge of ctx.relationships) {
      sections.push(edge.from);
      edge.to.forEach((t, i) => {
        const prefix = i === edge.to.length - 1 ? '  └── ' : '  ├── ';
        sections.push(`${prefix}${t}`);
      });
      sections.push('');
    }
    sections.push('```', '');
  }

  // Stats (always)
  sections.push(
    '## Generation Stats',
    '',
    `- Files scanned: ${ctx.stats.filesScanned}`,
    `- Files analyzed: ${ctx.stats.filesAnalyzed}`,
    `- Files skipped: ${ctx.stats.filesSkipped}`,
  );
  if (focused) sections.push(`- Focus: ${ctx.focus}`);
  sections.push('');

  return redactSecrets(sections.join('\n'));
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
