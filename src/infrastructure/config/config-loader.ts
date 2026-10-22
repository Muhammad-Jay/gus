import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Configuration } from '../../application/ports/configuration.port.js';
import { InvalidConfigurationError } from '../../domain/errors/domain-errors.js';
import { getGlobalConfigPath, getProjectConfigPath } from './config-paths.js';
import { ConfigurationSchema } from './config.schema.js';

export class ConfigLoader {
  constructor(private globalDir?: string) {}

  async loadGlobal(): Promise<Configuration> {
    return this.loadFile(getGlobalConfigPath(this.globalDir), 'global');
  }

  async loadProject(repoRoot: string): Promise<Configuration> {
    return this.loadFile(getProjectConfigPath(repoRoot), 'project');
  }

  private async loadFile(path: string, scope: 'global' | 'project'): Promise<Configuration> {
    if (!existsSync(path)) {
      return {};
    }

    let parsed: unknown;
    try {
      const content = await readFile(path, 'utf-8');
      parsed = JSON.parse(content);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new InvalidConfigurationError(
        `Failed to parse ${scope} configuration file ${path}: ${reason}`,
      );
    }

    const result = ConfigurationSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      throw new InvalidConfigurationError(`Invalid ${scope} configuration file ${path}: ${issues}`);
    }

    return result.data;
  }
}
