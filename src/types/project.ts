export type Framework = 'nuxt' | 'vue';

export type DependencyCategory =
  | 'Framework'
  | 'UI'
  | 'State Management'
  | 'Routing'
  | 'HTTP/API'
  | 'Validation'
  | 'Testing'
  | 'Build'
  | 'Other';

export interface CategorizedDependency {
  name: string;
  version: string;
  category: DependencyCategory;
  isDev: boolean;
}

export interface PackageMetadata {
  name: string;
  packageManager: string | null;
  scripts: Record<string, string>;
  framework: Framework;
  frameworkVersion: string | null;
  dependencies: CategorizedDependency[];
  notableLibraries: string[];
}

export interface DirectoryNode {
  name: string;
  path: string;
  type: 'dir' | 'file';
  children?: DirectoryNode[];
  highlighted?: boolean;
}

export interface RouteInfo {
  file: string;
  route: string;
  dynamic: boolean;
}

export interface PluginInfo {
  file: string;
  mode: 'client' | 'server' | 'both' | 'unknown';
}

export interface ComponentMeta {
  file: string;
  name: string | null;
  type: 'page' | 'layout' | 'component' | 'unknown';
  scriptSetup: boolean;
  imports: string[];
  localComponents: string[];
  composables: string[];
  stores: string[];
  props: string[];
  emits: string[];
  slots: string[];
  usesRouting: boolean;
}

export interface TsFileMeta {
  file: string;
  type: 'store' | 'composable' | 'util' | 'service' | 'type' | 'plugin' | 'middleware' | 'other';
  exports: string[];
  exportTypes: string[];
  exportInterfaces: string[];
  exportClasses: string[];
  imports: string[];
  storeName: string | null;
  composableName: string | null;
}

export interface ConfigSummary {
  file: string;
  summary: string[];
}

export interface ArchitectureEdge {
  from: string;
  to: string[];
}

export interface ScanStats {
  filesScanned: number;
  filesAnalyzed: number;
  filesSkipped: number;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'UNKNOWN';

export interface ApiEndpoint {
  method: HttpMethod;
  path: string;
  sourceFile: string;
  usedBy: string[];
  requestType: string | null;
  responseType: string | null;
  client?: string | null;
}

export interface DomainType {
  name: string;
  kind: 'interface' | 'type' | 'enum';
  file: string;
  fields: string[];
  references: string[];
}

export interface EntryPointNode {
  id: string;
  kind: 'app' | 'main' | 'middleware' | 'layout' | 'page' | 'component' | 'composable' | 'store' | 'api';
  children: string[];
}

export interface EntryPointMap {
  roots: string[];
  nodes: EntryPointNode[];
  summaryLines: string[];
  detected: boolean;
}

/** Detection status — never invent; use undetected when unsure */
export type DetectionStatus = 'detected' | 'undetected';

export interface CapabilityFinding {
  status: DetectionStatus;
  /** Short evidence labels, only when detected */
  evidence: string[];
}

export interface ProjectCapabilities {
  framework: CapabilityFinding;
  typescript: CapabilityFinding;
  routing: CapabilityFinding;
  stateManagement: CapabilityFinding;
  httpApi: CapabilityFinding;
  i18n: CapabilityFinding;
  uiLibrary: CapabilityFinding;
  cssFramework: CapabilityFinding;
  pwa: CapabilityFinding;
  authentication: CapabilityFinding;
  validation: CapabilityFinding;
  /** Directories actually present (discovered, not assumed) */
  presentDirectories: string[];
}

export interface ProjectContext {
  root: string;
  framework: Framework;
  package: PackageMetadata;
  capabilities: ProjectCapabilities;
  structure: DirectoryNode[];
  routes: RouteInfo[];
  layouts: string[];
  middleware: string[];
  plugins: PluginInfo[];
  composables: TsFileMeta[];
  stores: TsFileMeta[];
  server: {
    api: string[];
    routes: string[];
    middleware: string[];
    plugins: string[];
  } | null;
  components: ComponentMeta[];
  tsFiles: TsFileMeta[];
  importantConfigs: ConfigSummary[];
  conventions: string[];
  relationships: ArchitectureEdge[];
  apiSurface: ApiEndpoint[];
  domainTypes: DomainType[];
  entryPoints: EntryPointMap;
  focus: string | null;
  stats: ScanStats;
  appDir: string | null;
}

export type OutputMode = 'context' | 'docs';

export interface CliOptions {
  projectPath: string;
  output: string;
  /** `context` = AI/technical markdown; `docs` = plain-language bilingual overview */
  mode: OutputMode;
  verbose: boolean;
  dryRun: boolean;
  exclude: string[];
  include: string[];
  focus: string | null;
}
