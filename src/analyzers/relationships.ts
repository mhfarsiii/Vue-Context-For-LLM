import type { ArchitectureEdge, ComponentMeta, TsFileMeta } from '../types/project.js';

const MAX_EDGES = 25;
const MAX_CHILDREN = 6;

/**
 * Build a light dependency map from component/composable metadata.
 * Intentionally capped to keep context small.
 */
export function buildRelationships(
  components: ComponentMeta[],
  tsFiles: TsFileMeta[],
): ArchitectureEdge[] {
  const edges: ArchitectureEdge[] = [];

  const importantComponents = components
    .filter((c) => {
      const meaningfulComposables = c.composables.filter(
        (x) =>
          ![
            'useRoute()',
            'useRouter()',
            'useNuxtApp()',
            'useRuntimeConfig()',
            'useState()',
            'useCookie()',
            'useFetch()',
            'useAsyncData()',
            'useHead()',
            'useSeoMeta()',
            'useI18n()',
          ].includes(x),
      );
      return (
        c.type === 'page' ||
        c.localComponents.length > 0 ||
        c.stores.length > 0 ||
        meaningfulComposables.length > 0
      );
    })
    .slice(0, 25);

  for (const c of importantComponents) {
    const to: string[] = [];
    for (const lc of c.localComponents.slice(0, MAX_CHILDREN)) to.push(lc);
    for (const comp of c.composables.slice(0, 4)) to.push(comp);
    for (const store of c.stores.slice(0, 4)) to.push(store);
    if (to.length) edges.push({ from: c.file, to: unique(to) });
    if (edges.length >= MAX_EDGES) break;
  }

  for (const t of tsFiles) {
    if (edges.length >= MAX_EDGES) break;
    if (t.type !== 'composable' && t.type !== 'store' && t.type !== 'service') continue;

    const localImports = t.imports
      .filter((i) => i.startsWith('.') || i.startsWith('~/') || i.startsWith('@/'))
      .slice(0, MAX_CHILDREN);

    if (localImports.length) {
      edges.push({
        from: t.composableName ?? t.storeName ?? t.file,
        to: localImports,
      });
    }
  }

  return edges.slice(0, MAX_EDGES);
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}
