import fs from 'node:fs';
import path from 'node:path';
import type { Framework } from '../types/project.js';

export interface FrameworkDetection {
  framework: Framework;
  version: string | null;
  packageJsonPath: string;
  packageJson: Record<string, unknown>;
}

export class FrameworkDetectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrameworkDetectError';
  }
}

function readPackageJson(root: string): { path: string; data: Record<string, unknown> } {
  const packageJsonPath = path.join(root, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new FrameworkDetectError(
      `No package.json found in ${root}. Is this a Vue or Nuxt project?`,
    );
  }
  try {
    const raw = fs.readFileSync(packageJsonPath, 'utf8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    return { path: packageJsonPath, data };
  } catch {
    throw new FrameworkDetectError(`Failed to parse package.json at ${packageJsonPath}`);
  }
}

function depsOf(pkg: Record<string, unknown>): Record<string, string> {
  const deps = {
    ...((pkg.dependencies as Record<string, string> | undefined) ?? {}),
    ...((pkg.devDependencies as Record<string, string> | undefined) ?? {}),
  };
  return deps;
}

export function detectFramework(root: string): FrameworkDetection {
  const { path: packageJsonPath, data } = readPackageJson(root);
  const deps = depsOf(data);

  if (deps.nuxt) {
    return {
      framework: 'nuxt',
      version: deps.nuxt,
      packageJsonPath,
      packageJson: data,
    };
  }

  if (deps.vue) {
    return {
      framework: 'vue',
      version: deps.vue,
      packageJsonPath,
      packageJson: data,
    };
  }

  // Soft signals when deps omitted (rare monorepo / incomplete fixtures)
  const hasNuxtConfig =
    fs.existsSync(path.join(root, 'nuxt.config.ts')) ||
    fs.existsSync(path.join(root, 'nuxt.config.js')) ||
    fs.existsSync(path.join(root, 'nuxt.config.mjs'));

  if (hasNuxtConfig) {
    return {
      framework: 'nuxt',
      version: null,
      packageJsonPath,
      packageJson: data,
    };
  }

  throw new FrameworkDetectError(
    `Could not detect Vue or Nuxt in ${root}. Add "vue" or "nuxt" to package.json dependencies.`,
  );
}

/** Resolve Nuxt 3/4 source root: prefer app/ when it looks like Nuxt 4 app dir. */
export function resolveAppDir(root: string): string | null {
  const appDir = path.join(root, 'app');
  if (!fs.existsSync(appDir) || !fs.statSync(appDir).isDirectory()) return null;

  const markers = ['pages', 'components', 'layouts', 'composables', 'plugins', 'middleware'];
  const hasMarker = markers.some((m) => fs.existsSync(path.join(appDir, m)));
  // Also treat presence of app.vue inside app/ as marker
  const hasAppVue = fs.existsSync(path.join(appDir, 'app.vue'));
  if (hasMarker || hasAppVue) return 'app';
  return null;
}

export function sourceRoots(root: string, appDir: string | null): string[] {
  return appDir ? [path.join(root, appDir), root] : [root];
}
