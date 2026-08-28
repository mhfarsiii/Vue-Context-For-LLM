#!/usr/bin/env node
import { Command } from 'commander';
import { FrameworkDetectError } from './analyzers/framework-detector.js';
import {
  generateProjectContext,
  printDryRun,
  printSuccess,
  type CliOptions,
} from './index.js';
import type { OutputMode } from './types/project.js';

const DEFAULT_CONTEXT_OUTPUT = '.ai/project-context.md';
const DEFAULT_DOCS_OUTPUT = '.ai/project-overview.md';

function resolveMode(raw: string | undefined): OutputMode {
  const m = (raw ?? 'context').trim().toLowerCase();
  if (m === 'docs' || m === 'documentation' || m === 'overview') return 'docs';
  return 'context';
}

const program = new Command();

program
  .name('vue-context-project')
  .description('Generate AI-friendly project context for Vue and Nuxt projects')
  .argument('[path]', 'project root', '.')
  .option(
    '-o, --output <file>',
    `output file path (default: ${DEFAULT_CONTEXT_OUTPUT}, or ${DEFAULT_DOCS_OUTPUT} with --mode docs)`,
  )
  .option(
    '--mode <mode>',
    'output mode: context (AI/technical) or docs (plain-language bilingual overview)',
    'context',
  )
  .option('-v, --verbose', 'verbose logging', false)
  .option('--dry-run', 'analyze without writing output', false)
  .option('--focus <target>', 'focus on a feature keyword, route, or path (e.g. products, pages/about.vue)')
  .option(
    '--exclude <patterns>',
    'comma-separated glob patterns to exclude',
    (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean),
    [] as string[],
  )
  .option(
    '--include <patterns>',
    'comma-separated glob patterns to narrow analyzed files',
    (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean),
    [] as string[],
  )
  .action((projectPath: string, opts: {
    output?: string;
    mode: string;
    verbose: boolean;
    dryRun: boolean;
    focus?: string;
    exclude: string[];
    include: string[];
  }) => {
    const mode = resolveMode(opts.mode);
    const options: CliOptions = {
      projectPath: projectPath || '.',
      output: opts.output?.trim() || (mode === 'docs' ? DEFAULT_DOCS_OUTPUT : DEFAULT_CONTEXT_OUTPUT),
      mode,
      verbose: opts.verbose,
      dryRun: opts.dryRun,
      exclude: opts.exclude ?? [],
      include: opts.include ?? [],
      focus: opts.focus?.trim() || null,
    };

    try {
      if (options.verbose) {
        console.log(`Scanning ${options.projectPath}...`);
        console.log(`Mode: ${options.mode}`);
        if (options.focus) console.log(`Focus: ${options.focus}`);
      }

      const result = generateProjectContext(options);

      if (options.dryRun) {
        printDryRun(result, options.verbose);
      } else {
        printSuccess(result, options.mode);
      }
    } catch (err) {
      if (err instanceof FrameworkDetectError) {
        console.error(`\nError: ${err.message}\n`);
        process.exitCode = 1;
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}\n`);
      if (options.verbose && err instanceof Error && err.stack) {
        console.error(err.stack);
      }
      process.exitCode = 1;
    }
  });

program.parse();
