import fs from 'node:fs';
import ts from 'typescript';
import type { DomainType } from '../types/project.js';

/** Structural exclusions only — no domain/feature vocabulary hardcoding */
const UTILITY_NAME_RE =
  /^(Partial|Required|Readonly|Pick|Omit|Record|Extract|Exclude|NonNullable|ReturnType|Parameters|Awaited|Promise|Array|Map|Set|Date|Error|Function)$/;

const UTILITY_SUFFIX_RE =
  /(Props|Emits|Slots|Options|Config|Settings|Params|QueryParams|Query|Payload|Dto|DTO|Schema|FormState|FormData|FormValues|TableColumn|Ref|Computed|Instance|Component|Context|Event|Handler|Callback|Fn|Utils?|Helper)$/;

const GENERIC_WRAPPER_RE =
  /^(ApiResponse|PaginatedResponse|PaginationMeta|PageResult|ListResult|Result|ResponseEnvelope)$/;

function isUtilityName(name: string): boolean {
  if (UTILITY_NAME_RE.test(name)) return true;
  if (GENERIC_WRAPPER_RE.test(name)) return true;
  if (UTILITY_SUFFIX_RE.test(name)) return true;
  if (/(QueryParams|ListResponse|ListItem)$/.test(name)) return true;
  return false;
}

/**
 * Domain-ish names: PascalCase exports that look like data models.
 * No project-specific entity lists (Product/Cart/Checkout/…).
 */
function isCandidateDomainName(name: string): boolean {
  if (name.length < 2) return false;
  if (!/^[A-Z][A-Za-z0-9]+$/.test(name)) return false;
  if (isUtilityName(name)) return false;
  return true;
}

function typeNodeToName(node: ts.TypeNode): string | null {
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    return node.typeName.text;
  }
  if (ts.isArrayTypeNode(node)) return typeNodeToName(node.elementType);
  if (ts.isTypeOperatorNode(node) || ts.isParenthesizedTypeNode(node)) {
    return typeNodeToName(node.type);
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    for (const t of node.types) {
      const n = typeNodeToName(t);
      if (n && isCandidateDomainName(n)) return n;
    }
  }
  return null;
}

function collectFieldsAndRefs(
  members: ts.NodeArray<ts.TypeElement> | undefined,
): { fields: string[]; references: string[] } {
  const fields: string[] = [];
  const references: string[] = [];
  if (!members) return { fields, references };

  for (const member of members) {
    if (!ts.isPropertySignature(member) || !member.name) continue;
    const name =
      ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
        ? member.name.text
        : null;
    if (!name || name.startsWith('_')) continue;
    fields.push(name);
    if (member.type) {
      const ref = typeNodeToName(member.type);
      if (ref && isCandidateDomainName(ref) && ref !== name) references.push(ref);
    }
  }
  return { fields: fields.slice(0, 20), references: [...new Set(references)].slice(0, 12) };
}

function shouldScanFile(relativePath: string): boolean {
  const n = relativePath.replace(/\\/g, '/');
  if (n.includes('/node_modules/')) return false;
  if (/shims-.*\.d\.ts$/.test(n)) return false;
  if (n.includes('/types/') || n.startsWith('types/') || n.endsWith('.d.ts')) return true;
  if (
    n.includes('/models/') ||
    n.startsWith('models/') ||
    n.includes('/entities/') ||
    n.startsWith('entities/')
  ) {
    return true;
  }
  return false;
}

function hasExport(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

/**
 * Extract domain-like types structurally.
 * Requires fields (or enum members) — empty marker interfaces are omitted.
 */
export function analyzeDomainTypes(
  files: Array<{ absolutePath: string; relativePath: string }>,
): DomainType[] {
  const results: DomainType[] = [];
  const seen = new Set<string>();

  for (const f of files.filter((x) => shouldScanFile(x.relativePath))) {
    let content: string;
    try {
      content = fs.readFileSync(f.absolutePath, 'utf8');
    } catch {
      continue;
    }
    if (content.length > 400_000) continue;

    const sf = ts.createSourceFile(
      f.absolutePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const visit = (node: ts.Node) => {
      const file = f.relativePath.replace(/\\/g, '/');

      if (ts.isInterfaceDeclaration(node) && hasExport(node)) {
        const name = node.name.text;
        if (!isCandidateDomainName(name)) return;
        const key = `${name}@${file}`;
        if (seen.has(key)) return;
        const { fields, references } = collectFieldsAndRefs(node.members);
        const heritageRefs: string[] = [];
        if (node.heritageClauses) {
          for (const hc of node.heritageClauses) {
            for (const t of hc.types) {
              if (ts.isIdentifier(t.expression) && isCandidateDomainName(t.expression.text)) {
                heritageRefs.push(t.expression.text);
              }
            }
          }
        }
        // Need substance: fields or heritage — never invent meaning from name alone
        if (fields.length < 1 && heritageRefs.length < 1) return;
        seen.add(key);
        results.push({
          name,
          kind: 'interface',
          file,
          fields,
          references: [...new Set([...references, ...heritageRefs])],
        });
      }

      if (ts.isTypeAliasDeclaration(node) && hasExport(node)) {
        const name = node.name.text;
        if (!isCandidateDomainName(name)) return;
        if (!ts.isTypeLiteralNode(node.type)) return;
        const key = `${name}@${file}`;
        if (seen.has(key)) return;
        const { fields, references } = collectFieldsAndRefs(node.type.members);
        if (fields.length < 2) return;
        seen.add(key);
        results.push({ name, kind: 'type', file, fields, references });
      }

      if (ts.isEnumDeclaration(node) && hasExport(node)) {
        const name = node.name.text;
        if (!isCandidateDomainName(name) && !/^[A-Z][A-Za-z0-9]+$/.test(name)) return;
        if (isUtilityName(name)) return;
        const key = `${name}@${file}`;
        if (seen.has(key)) return;
        const fields = node.members
          .map((m) => (m.name && ts.isIdentifier(m.name) ? m.name.text : null))
          .filter((x): x is string => Boolean(x))
          .slice(0, 16);
        if (fields.length < 2) return;
        seen.add(key);
        results.push({ name, kind: 'enum', file, fields, references: [] });
      }

      ts.forEachChild(node, visit);
    };

    visit(sf);
  }

  // Prefer types with more fields / refs (structural richness), not vocabulary hints
  return results
    .sort((a, b) => {
      const score = (t: DomainType) => t.fields.length * 2 + t.references.length;
      const d = score(b) - score(a);
      return d !== 0 ? d : a.name.localeCompare(b.name);
    })
    .slice(0, 80);
}
