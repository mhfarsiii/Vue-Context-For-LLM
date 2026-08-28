import fs from 'node:fs';
import path from 'node:path';
import { detectFramework, resolveAppDir } from './analyzers/framework-detector.js';
import { analyzePackage } from './analyzers/package-analyzer.js';
import { analyzeVueFiles } from './analyzers/component-analyzer.js';
import { analyzeTypeScriptFiles } from './analyzers/typescript-analyzer.js';
import {
  analyzeNuxtStructure,
  collectConventions,
  readConfigSummaries,
} from './analyzers/nuxt-analyzer.js';
import { analyzeVueStructure } from './analyzers/vue-analyzer.js';
import { buildRelationships } from './analyzers/relationships.js';
import { analyzeApiSurface } from './analyzers/api-surface-analyzer.js';
import { analyzeDomainTypes } from './analyzers/domain-types-analyzer.js';
import { buildEntryPointMap } from './analyzers/entry-point-analyzer.js';
import { detectCapabilities } from './analyzers/capability-detector.js';
import { applyFocus } from './analyzers/focus-filter.js';
import { buildDirectoryTree, scanProject } from './scanner/project-scanner.js';
import { generateMarkdown, formatSize } from './output/markdown-generator.js';
import { generateDocsMarkdown } from './output/docs-generator.js';
import type { CliOptions, OutputMode, ProjectContext } from './types/project.js';

export interface GenerateResult {
  context: ProjectContext;
  markdown: string;
  outputPath: string | null;
  dryRun: boolean;
}

export function generateProjectContext(options: CliOptions): GenerateResult {
  const root = path.resolve(options.projectPath);

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Project path does not exist or is not a directory: ${root}`);
  }

  const detection = detectFramework(root);
  const appDir = detection.framework === 'nuxt' ? resolveAppDir(root) : null;

  const scan = scanProject(root, {
    extraExclude: options.exclude,
    extraInclude: options.include.length ? options.include : undefined,
  });

  const analyzedFiles = scan.analyzed.map((f) => ({
    absolutePath: f.absolutePath,
    relativePath: f.relativePath.replace(/\\/g, '/'),
  }));
  const relativePaths = analyzedFiles.map((f) => f.relativePath);

  const pkgMeta = analyzePackage(
    root,
    detection.packageJson,
    detection.framework,
    detection.version,
  );

  // Structure tree: only include dirs that actually appear (capability-driven list + shallow files)
  const presentTop = new Set(
    relativePaths.flatMap((p) => {
      const parts = p.split('/');
      return parts[0] ? [parts[0]] : [];
    }),
  );

  const structure = buildDirectoryTree(
    root,
    relativePaths.filter((p) => {
      const parts = p.split('/');
      if (parts[0] === '.github' || parts[0] === '.cursor' || parts[0] === '.vscode') return false;
      if (parts.length <= 2) return true;
      const top = parts[0] === appDir ? parts[1] : parts[0];
      return top != null && presentTop.has(parts[0]!) && (
        // include nested content under any present interesting folder name anywhere in path
        parts.some((part) =>
          [
            'components',
            'pages',
            'views',
            'layouts',
            'composables',
            'hooks',
            'stores',
            'store',
            'plugins',
            'middleware',
            'server',
            'utils',
            'helpers',
            'services',
            'api',
            'types',
            'models',
            'entities',
            'assets',
            'public',
            'router',
            'app',
            'src',
          ].includes(part),
        )
      );
    }),
    4,
  );

  const components = analyzeVueFiles(analyzedFiles);
  const tsFiles = analyzeTypeScriptFiles(analyzedFiles);

  const structured =
    detection.framework === 'nuxt'
      ? analyzeNuxtStructure(relativePaths, appDir, tsFiles)
      : analyzeVueStructure(relativePaths, tsFiles);

  const importantConfigs = readConfigSummaries(root, relativePaths);
  const conventions = collectConventions(root, relativePaths);
  const relationships = buildRelationships(components, tsFiles);

  const apiSurface = analyzeApiSurface(analyzedFiles, tsFiles);
  const domainTypes = analyzeDomainTypes(analyzedFiles);

  const capabilities = detectCapabilities({
    pkg: pkgMeta,
    relativePaths,
    routes: structured.routes,
    stores: structured.stores,
    apiSurface,
    hasTypeScriptFiles: relativePaths.some((p) => /\.tsx?$/.test(p)),
  });

  const entryPoints = buildEntryPointMap({
    appDir,
    relativePaths,
    components,
    layouts: structured.layouts,
    middleware: structured.middleware,
    routes: structured.routes,
    composables: structured.composables,
    stores: structured.stores,
    apiSurface,
  });

  let context: ProjectContext = {
    root,
    framework: detection.framework,
    package: pkgMeta,
    capabilities,
    structure,
    ...structured,
    components,
    tsFiles,
    importantConfigs,
    conventions,
    relationships,
    apiSurface,
    domainTypes,
    entryPoints,
    focus: null,
    stats: scan.stats,
    appDir,
  };

  if (options.focus?.trim()) {
    context = applyFocus(context, options.focus.trim());
  }

  const mode = options.mode === 'docs' ? 'docs' : 'context';
  const markdown =
    mode === 'docs' ? generateDocsMarkdown(context) : generateMarkdown(context);

  if (options.dryRun) {
    return { context, markdown, outputPath: null, dryRun: true };
  }

  const outputPath = path.isAbsolute(options.output)
    ? options.output
    : path.join(root, options.output);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown, 'utf8');

  return { context, markdown, outputPath, dryRun: false };
}

export function printSuccess(result: GenerateResult, mode: CliOptions['mode'] = 'context'): void {
  const { context, markdown, outputPath } = result;
  const size = Buffer.byteLength(markdown, 'utf8');

  console.log('');
  console.log(
    mode === 'docs'
      ? 'Project overview (docs) generated successfully.'
      : 'Context generated successfully.',
  );
  console.log('');
  console.log(`Mode:           ${mode}`);
  console.log(`Files scanned:  ${context.stats.filesScanned}`);
  console.log(`Files analyzed: ${context.stats.filesAnalyzed}`);
  console.log(`Files skipped:  ${context.stats.filesSkipped}`);
  if (context.focus) console.log(`Focus:          ${context.focus}`);
  if (outputPath) console.log(`Output:         ${outputPath}`);
  console.log(`Estimated size: ${formatSize(size)}`);
  console.log('');
}

export function printDryRun(result: GenerateResult, verbose: boolean): void {
  const { context } = result;
  console.log('');
  console.log('Dry run — no output file written.');
  console.log(`Framework: ${context.framework}`);
  if (context.focus) console.log(`Focus: ${context.focus}`);
  console.log(`Files scanned:  ${context.stats.filesScanned}`);
  console.log(`Files analyzed: ${context.stats.filesAnalyzed}`);
  console.log(`Files skipped:  ${context.stats.filesSkipped}`);
  console.log(`API endpoints:  ${context.apiSurface.length}`);
  console.log(`Domain types:   ${context.domainTypes.length}`);
  console.log(`Estimated size: ${formatSize(Buffer.byteLength(result.markdown, 'utf8'))}`);

  if (verbose) {
    console.log('\nCapabilities:');
    for (const [k, v] of Object.entries(context.capabilities)) {
      if (k === 'presentDirectories') {
        console.log(`  directories: ${(v as string[]).join(', ') || 'none'}`);
        continue;
      }
      const finding = v as { status: string; evidence: string[] };
      console.log(`  ${k}: ${finding.status}${finding.evidence.length ? ` (${finding.evidence.join(', ')})` : ''}`);
    }
  }
  console.log('');
}

export type { CliOptions, OutputMode, ProjectContext };
