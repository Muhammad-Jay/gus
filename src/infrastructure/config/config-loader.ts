import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Configuration } from '../../application/ports/configuration.port.js';
import { ConfigurationSchema } from './config.schema.js';
import { getGlobalConfigPath, getProjectConfigPath } from './config-paths.js';

export class ConfigLoader {
  async loadGlobal(): Promise<Configuration> {
    const path = getGlobalConfigPath();
    if (!existsSync(path)) {
      return {};
    }
    try {
      const content = await readFile(path, 'utf-8');
      const parsed = JSON.parse(content);
      return ConfigurationSchema.parse(parsed);
    } catch (error) {
      throw new Error(`Failed to load global config: ${error}`);
    }
  }

  async loadProject(repoRoot: string): Promise<Configuration> {
    const path = getProjectConfigPath(repoRoot);
    if (!existsSync(path)) {
      return {};
    }
    try {
      const content = await readFile(path, 'utf-8');
      const parsed = JSON.parse(content);
      return ConfigurationSchema.parse(parsed);
    } catch (error) {
      throw new Error(`Failed to load project config: ${error}`);
    }
  }
}
