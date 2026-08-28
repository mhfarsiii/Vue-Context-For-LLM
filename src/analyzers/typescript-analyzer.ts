import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { TsFileMeta } from '../types/project.js';

function inferTsType(relativePath: string, content: string): TsFileMeta['type'] {
  const n = relativePath.replace(/\\/g, '/');
  if (n.includes('/stores/') || n.includes('/store/') || /defineStore\s*\(/.test(content)) {
    return 'store';
  }
  if (n.includes('/composables/') || /(?:^|\n)\s*export\s+(?:async\s+)?function\s+use[A-Z]/.test(content)) {
    return 'composable';
  }
  if (n.includes('/plugins/')) return 'plugin';
  if (n.includes('/middleware/')) return 'middleware';
  if (n.includes('/services/')) return 'service';
  if (n.includes('/types/') || n.endsWith('.d.ts')) return 'type';
  if (n.includes('/utils/') || n.includes('/helpers/')) return 'util';
  return 'other';
}

export function analyzeTypeScriptFile(
  absolutePath: string,
  relativePath: string,
): TsFileMeta | null {
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return null;
  }

  // Skip declaration-only ambient dumps that are huge
  if (content.length > 200_000) {
    return {
      file: relativePath.replace(/\\/g, '/'),
      type: 'other',
      exports: [],
      exportTypes: [],
      exportInterfaces: [],
      exportClasses: [],
      imports: [],
      storeName: null,
      composableName: null,
    };
  }

  const kind = absolutePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(absolutePath, content, ts.ScriptTarget.Latest, true, kind);

  const exports: string[] = [];
  const exportTypes: string[] = [];
  const exportInterfaces: string[] = [];
  const exportClasses: string[] = [];
  const imports: string[] = [];
  let storeName: string | null = null;
  let composableName: string | null = null;

  const considerExportName = (name: string, kindHint?: string) => {
    if (kindHint === 'type') exportTypes.push(name);
    else if (kindHint === 'interface') exportInterfaces.push(name);
    else if (kindHint === 'class') exportClasses.push(name);
    else exports.push(name);

    if (/^use.+Store$/.test(name) || name.endsWith('Store')) {
      storeName = storeName ?? name;
    }
    if (/^use[A-Z]/.test(name)) {
      composableName = composableName ?? name;
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }

    // defineStore('cart', ...)
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineStore' &&
      node.arguments[0]
    ) {
      const arg = node.arguments[0];
      if (ts.isStringLiteral(arg)) storeName = `use${capitalize(arg.text)}Store`;
    }

    if (ts.isFunctionDeclaration(node) && node.name && hasExportModifier(node)) {
      considerExportName(node.name.text);
    }

    if (ts.isClassDeclaration(node) && node.name && hasExportModifier(node)) {
      considerExportName(node.name.text, 'class');
    }

    if (ts.isInterfaceDeclaration(node) && hasExportModifier(node)) {
      considerExportName(node.name.text, 'interface');
    }

    if (ts.isTypeAliasDeclaration(node) && hasExportModifier(node)) {
      considerExportName(node.name.text, 'type');
    }

    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) considerExportName(decl.name.text);
      }
    }

    // export { foo, bar }
    if (
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const el of node.exportClause.elements) {
        considerExportName(el.name.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  const fileType = inferTsType(relativePath, content);

  return {
    file: relativePath.replace(/\\/g, '/'),
    type: fileType,
    exports: unique(exports),
    exportTypes: unique(exportTypes),
    exportInterfaces: unique(exportInterfaces),
    exportClasses: unique(exportClasses),
    imports: unique(imports),
    storeName,
    composableName,
  };
}

function hasExportModifier(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}

export function analyzeTypeScriptFiles(
  files: Array<{ absolutePath: string; relativePath: string }>,
  limit = 250,
): TsFileMeta[] {
  const tsFiles = files
    .filter((f) => /\.tsx?$/.test(f.relativePath) && !f.relativePath.endsWith('.d.ts'))
    .filter((f) => {
      const n = f.relativePath.replace(/\\/g, '/');
      // Focus on important dirs; still allow root configs later separately
      return (
        /(^|\/)(composables|stores|store|utils|helpers|services|types|plugins|middleware|server)\//.test(
          n,
        ) || /(^|\/)use[A-Z][^/]+\.ts$/.test(n)
      );
    })
    .slice(0, limit);

  const results: TsFileMeta[] = [];
  for (const f of tsFiles) {
    const meta = analyzeTypeScriptFile(f.absolutePath, f.relativePath);
    if (meta) results.push(meta);
  }
  return results.sort((a, b) => a.file.localeCompare(b.file));
}
