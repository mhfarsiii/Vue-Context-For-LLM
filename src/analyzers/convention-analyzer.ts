import type { ProjectCapabilities, ProjectContext } from '../types/project.js';

/**
 * Conventions derived only from detected capabilities + present files.
 * Never assumes stores/, composables/, server/, etc. exist.
 */
export function buildConventionLines(ctx: ProjectContext): string[] {
  const lines: string[] = [];
  const caps = ctx.capabilities;

  lines.push(
    `- Framework: ${caps.framework.status === 'detected' ? caps.framework.evidence.join(', ') : 'undetected'}`,
  );

  if (ctx.appDir) {
    lines.push(`- Source root observed: \`${ctx.appDir}/\``);
  }

  if (caps.presentDirectories.length) {
    lines.push(`- Present directories: ${caps.presentDirectories.map((d) => `\`${d}/\``).join(', ')}`);
  } else {
    lines.push('- Present directories: undetected');
  }

  const pushCap = (label: string, finding: ProjectCapabilities[keyof ProjectCapabilities]) => {
    if (typeof finding === 'object' && finding !== null && 'status' in finding) {
      if (finding.status === 'detected') {
        lines.push(`- ${label}: ${finding.evidence.join(', ')}`);
      } else {
        lines.push(`- ${label}: undetected`);
      }
    }
  };

  pushCap('Routing', caps.routing);
  pushCap('State management', caps.stateManagement);
  pushCap('HTTP / API', caps.httpApi);
  pushCap('TypeScript', caps.typescript);
  pushCap('i18n', caps.i18n);
  pushCap('UI library', caps.uiLibrary);
  pushCap('CSS framework', caps.cssFramework);
  pushCap('PWA', caps.pwa);
  pushCap('Authentication', caps.authentication);
  pushCap('Validation', caps.validation);

  for (const c of ctx.conventions) {
    lines.push(`- Project rules file: \`${c}\``);
  }

  for (const cfg of ctx.importantConfigs) {
    if (cfg.file.startsWith('nuxt.config') || cfg.file.startsWith('vite.config')) {
      for (const s of cfg.summary.slice(0, 3)) lines.push(`- ${cfg.file}: ${s}`);
    }
  }

  return lines;
}

export function renderCapabilitiesSection(caps: ProjectCapabilities): string[] {
  const rows: Array<[string, ProjectCapabilities[keyof ProjectCapabilities]]> = [
    ['Framework', caps.framework],
    ['TypeScript', caps.typescript],
    ['Routing', caps.routing],
    ['State management', caps.stateManagement],
    ['HTTP / API', caps.httpApi],
    ['i18n', caps.i18n],
    ['UI library', caps.uiLibrary],
    ['CSS framework', caps.cssFramework],
    ['PWA', caps.pwa],
    ['Authentication', caps.authentication],
    ['Validation', caps.validation],
  ];

  const lines = ['## Capabilities', ''];
  for (const [label, finding] of rows) {
    if (typeof finding !== 'object' || !('status' in finding)) continue;
    if (finding.status === 'detected') {
      lines.push(`- **${label}:** detected — ${finding.evidence.join('; ')}`);
    } else {
      lines.push(`- **${label}:** undetected`);
    }
  }
  if (caps.presentDirectories.length) {
    lines.push(
      `- **Observed directories:** ${caps.presentDirectories.map((d) => `\`${d}/\``).join(', ')}`,
    );
  }
  lines.push('');
  return lines;
}
