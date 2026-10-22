import type {
  ConfigScope,
  Configuration,
  ConfigurationPatch,
  ResolvedConfiguration,
} from '../../domain/config/configuration.js';

export type {
  AutomationPolicy,
  ConfigKey,
  ConfigScope,
  ConfigValueSource,
  Configuration,
  ConfigurationPatch,
  ConfigurationSection,
  ResolvedConfiguration,
} from '../../domain/config/configuration.js';

export interface ConfigurationService {
  getMerged(repoRoot?: string): Promise<Configuration>;
  getResolved(repoRoot?: string): Promise<ResolvedConfiguration>;
  read(scope: ConfigScope, repoRoot?: string): Promise<Configuration>;
  write(scope: ConfigScope, patch: ConfigurationPatch, repoRoot?: string): Promise<Configuration>;
  getLocation(scope: ConfigScope, repoRoot?: string): string;
}
