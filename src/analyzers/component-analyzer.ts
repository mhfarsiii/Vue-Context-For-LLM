import fs from 'node:fs';
import path from 'node:path';
import { parse as parseSfc } from '@vue/compiler-sfc';
import ts from 'typescript';
import type { ComponentMeta } from '../types/project.js';

function inferComponentType(relativePath: string): ComponentMeta['type'] {
  const n = relativePath.replace(/\\/g, '/');
  if (n.includes('/pages/') || n.startsWith('pages/')) return 'page';
  if (n.includes('/layouts/') || n.startsWith('layouts/')) return 'layout';
  if (n.includes('/components/') || n.startsWith('components/')) return 'component';
  if (n.endsWith('app.vue') || n.endsWith('App.vue')) return 'component';
  return 'unknown';
}

function extractSlotsFromTemplate(template: string | undefined): string[] {
  if (!template) return [];
  const slots = new Set<string>();
  const named = template.matchAll(/<slot\b[^>]*\bname=["']([^"']+)["']/g);
  for (const m of named) slots.add(m[1]!);
  if (/<slot\b/.test(template) && slots.size === 0) slots.add('default');
  else if (/<slot\b(?![^>]*\bname=)/.test(template)) slots.add('default');
  return [...slots];
}

function scriptUsesRouting(source: string): boolean {
  return /\b(useRouter|useRoute|navigateTo|router\.(push|replace)|<NuxtLink|<RouterLink)\b/.test(
    source,
  );
}

function analyzeScript(
  scriptContent: string,
  scriptSetup: boolean,
): Pick<
  ComponentMeta,
  'imports' | 'localComponents' | 'composables' | 'stores' | 'props' | 'emits' | 'name' | 'usesRouting'
> {
  const imports: string[] = [];
  const localComponents: string[] = [];
  const composables: string[] = [];
  const stores: string[] = [];
  const props: string[] = [];
  const emits: string[] = [];
  let name: string | null = null;

  const sourceFile = ts.createSourceFile(
    'component.ts',
    scriptContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      imports.push(spec);
      if (/\.vue$/.test(spec) || /\/components\//.test(spec)) {
        const base = path.basename(spec).replace(/\.vue$/, '');
        localComponents.push(base);
      }
    }

    // defineOptions({ name: 'X' })
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineOptions' &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      for (const prop of node.arguments[0].properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === 'name' &&
          ts.isStringLiteral(prop.initializer)
        ) {
          name = prop.initializer.text;
        }
      }
    }

    // defineProps<{...}>() or defineProps({ ... })
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineProps'
    ) {
      extractPropNames(node, props);
    }

    // withDefaults(defineProps<...>(), ...)
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'withDefaults' &&
      node.arguments[0] &&
      ts.isCallExpression(node.arguments[0])
    ) {
      extractPropNames(node.arguments[0], props);
    }

    // defineEmits
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineEmits'
    ) {
      extractEmitNames(node, emits);
    }

    // useXxx() calls
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const fn = node.expression.text;
      if (/^use[A-Z]/.test(fn)) {
        if (/Store$/.test(fn) || fn === 'useStore') {
          stores.push(`${fn}()`);
        } else {
          composables.push(`${fn}()`);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  // Options API name / props / emits fallback via regex only when script setup is false
  if (!scriptSetup) {
    const nameMatch = scriptContent.match(/\bname\s*:\s*['"]([^'"]+)['"]/);
    if (nameMatch) name = nameMatch[1]!;
  }

  return {
    imports: unique(imports),
    localComponents: unique(localComponents),
    composables: unique(composables),
    stores: unique(stores),
    props: unique(props),
    emits: unique(emits),
    name,
    usesRouting: scriptUsesRouting(scriptContent),
  };
}

function extractPropNames(call: ts.CallExpression, out: string[]): void {
  // defineProps<{ foo: string; bar?: number }>()
  if (call.typeArguments?.[0] && ts.isTypeLiteralNode(call.typeArguments[0])) {
    for (const member of call.typeArguments[0].members) {
      if (ts.isPropertySignature(member) && member.name) {
        const n = propName(member.name);
        if (n) out.push(n);
      }
    }
  }

  // defineProps({ foo: String, bar: { type: Number } })
  if (call.arguments[0] && ts.isObjectLiteralExpression(call.arguments[0])) {
    for (const prop of call.arguments[0].properties) {
      if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
        const n = propName(prop.name);
        if (n) out.push(n);
      }
    }
  }

  // defineProps(['foo', 'bar'])
  if (call.arguments[0] && ts.isArrayLiteralExpression(call.arguments[0])) {
    for (const el of call.arguments[0].elements) {
      if (ts.isStringLiteral(el)) out.push(el.text);
    }
  }
}

function extractEmitNames(call: ts.CallExpression, out: string[]): void {
  // defineEmits<{ (e: 'click'): void; (e: 'update:modelValue', v: string): void }>()
  if (call.typeArguments?.[0] && ts.isTypeLiteralNode(call.typeArguments[0])) {
    for (const member of call.typeArguments[0].members) {
      if (ts.isCallSignatureDeclaration(member) && member.parameters[0]) {
        const p = member.parameters[0];
        if (p.type && ts.isLiteralTypeNode(p.type) && ts.isStringLiteral(p.type.literal)) {
          out.push(p.type.literal.text);
        }
      }
      if (ts.isPropertySignature(member) && member.name) {
        const n = propName(member.name);
        if (n) out.push(n);
      }
    }
  }

  // defineEmits(['click', 'update'])
  if (call.arguments[0] && ts.isArrayLiteralExpression(call.arguments[0])) {
    for (const el of call.arguments[0].elements) {
      if (ts.isStringLiteral(el)) out.push(el.text);
    }
  }

  // defineEmits({ click: null })
  if (call.arguments[0] && ts.isObjectLiteralExpression(call.arguments[0])) {
    for (const prop of call.arguments[0].properties) {
      if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
        const n = propName(prop.name);
        if (n) out.push(n);
      }
    }
  }
}

function propName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}

export function analyzeVueComponent(absolutePath: string, relativePath: string): ComponentMeta | null {
  let source: string;
  try {
    source = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return null;
  }

  let descriptor;
  try {
    const parsed = parseSfc(source, { filename: absolutePath });
    descriptor = parsed.descriptor;
  } catch {
    return null;
  }

  const scriptSetup = Boolean(descriptor.scriptSetup);
  const scriptBlock = descriptor.scriptSetup ?? descriptor.script;
  const scriptContent = scriptBlock?.content ?? '';

  const fromScript = scriptContent
    ? analyzeScript(scriptContent, scriptSetup)
    : {
        imports: [],
        localComponents: [],
        composables: [],
        stores: [],
        props: [],
        emits: [],
        name: null,
        usesRouting: false,
      };

  const slots = extractSlotsFromTemplate(descriptor.template?.content);
  const fileName = path.basename(relativePath, '.vue');

  // Also detect routing usage in template
  const template = descriptor.template?.content ?? '';
  const usesRouting =
    fromScript.usesRouting || /<(NuxtLink|RouterLink)\b/.test(template) || /\bnavigateTo\b/.test(template);

  return {
    file: relativePath.replace(/\\/g, '/'),
    name: fromScript.name ?? fileName,
    type: inferComponentType(relativePath),
    scriptSetup,
    imports: fromScript.imports,
    localComponents: fromScript.localComponents,
    composables: fromScript.composables,
    stores: fromScript.stores,
    props: fromScript.props,
    emits: fromScript.emits,
    slots,
    usesRouting,
  };
}

export function analyzeVueFiles(
  files: Array<{ absolutePath: string; relativePath: string }>,
  limit = 200,
): ComponentMeta[] {
  const vueFiles = files.filter((f) => f.relativePath.endsWith('.vue')).slice(0, limit);
  const results: ComponentMeta[] = [];
  for (const f of vueFiles) {
    const meta = analyzeVueComponent(f.absolutePath, f.relativePath);
    if (meta) results.push(meta);
  }
  return results.sort((a, b) => a.file.localeCompare(b.file));
}
