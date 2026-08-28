import fs from 'node:fs';
import path from 'node:path';
import {
  classifyPath,
  HIGHLIGHT_DIRS,
  type FilterOptions,
  type FilterReason,
} from './file-filter.js';

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  reason: FilterReason;
}

export interface ScanResult {
  root: string;
  files: ScannedFile[];
  analyzed: ScannedFile[];
  skipped: ScannedFile[];
  stats: {
    filesScanned: number;
    filesAnalyzed: number;
    filesSkipped: number;
  };
}

function resolveInsideRoot(root: string, candidate: string): string | null {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const rel = path.relative(resolvedRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

export function scanProject(root: string, filterOptions: FilterOptions = {}): ScanResult {
  const resolvedRoot = path.resolve(root);
  const files: ScannedFile[] = [];

  function walk(currentDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      let realPath = absolutePath;

      try {
        const stat = fs.lstatSync(absolutePath);
        if (stat.isSymbolicLink()) {
          realPath = fs.realpathSync(absolutePath);
          if (!resolveInsideRoot(resolvedRoot, realPath)) {
            files.push({
              absolutePath,
              relativePath: path.relative(resolvedRoot, absolutePath),
              reason: 'skip-dir',
            });
            continue;
          }
        }
      } catch {
        continue;
      }

      const relativePath = path.relative(resolvedRoot, absolutePath);
      let isDir = entry.isDirectory();
      try {
        if (entry.isSymbolicLink()) {
          isDir = fs.statSync(realPath).isDirectory();
        }
      } catch {
        continue;
      }

      const reason = classifyPath(relativePath, isDir, filterOptions);

      if (isDir) {
        if (reason === 'skip-dir' || reason === 'exclude-pattern') {
          files.push({ absolutePath, relativePath, reason });
          continue;
        }
        walk(realPath);
        continue;
      }

      files.push({ absolutePath, relativePath, reason });
    }
  }

  walk(resolvedRoot);

  const analyzed = files.filter((f) => f.reason === 'ok');
  const skipped = files.filter((f) => f.reason !== 'ok');

  return {
    root: resolvedRoot,
    files,
    analyzed,
    skipped,
    stats: {
      filesScanned: files.length,
      filesAnalyzed: analyzed.length,
      filesSkipped: skipped.length,
    },
  };
}

export function buildDirectoryTree(
  root: string,
  analyzedRelativePaths: string[],
  maxDepth = 6,
): import('../types/project.js').DirectoryNode[] {
  const rootName = path.basename(root);
  const tree: Map<string, import('../types/project.js').DirectoryNode> = new Map();

  const ensureDir = (relDir: string): import('../types/project.js').DirectoryNode => {
    if (tree.has(relDir)) return tree.get(relDir)!;
    const name = relDir === '' ? rootName : path.basename(relDir);
    const node: import('../types/project.js').DirectoryNode = {
      name,
      path: relDir || '.',
      type: 'dir',
      children: [],
      highlighted: HIGHLIGHT_DIRS.has(name),
    };
    tree.set(relDir, node);
    if (relDir !== '') {
      const parent = path.dirname(relDir);
      const parentKey = parent === '.' ? '' : parent;
      const parentNode = ensureDir(parentKey);
      parentNode.children = parentNode.children ?? [];
      if (!parentNode.children.some((c) => c.path === node.path)) {
        parentNode.children.push(node);
      }
    }
    return node;
  };

  ensureDir('');

  for (const rel of analyzedRelativePaths) {
    const parts = rel.split(/[/\\]/).filter(Boolean);
    if (parts.length > maxDepth) continue;

    let current = '';
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const next = current ? `${current}/${parts[i]}` : parts[i]!;
      if (!isLast) {
        ensureDir(next);
      } else {
        const parentKey = current;
        const parent = ensureDir(parentKey);
        parent.children = parent.children ?? [];
        if (!parent.children.some((c) => c.path === next)) {
          parent.children.push({
            name: parts[i]!,
            path: next,
            type: 'file',
          });
        }
      }
      current = next;
    }
  }

  const sortNodes = (nodes: import('../types/project.js').DirectoryNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children) sortNodes(n.children);
    }
  };

  const rootNode = tree.get('')!;
  sortNodes(rootNode.children ?? []);
  return rootNode.children ?? [];
}
