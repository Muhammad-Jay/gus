import {
  CONFIG_KEYS,
  CONFIG_KEY_LIST,
  type ConfigKey,
  type ConfigScope,
  type ConfigValueSource,
  type ConfigurationPatch,
  coerceConfigValue,
  configurationPath,
  describeConfigKey,
  getConfigurationValue,
  splitConfigKey,
} from '../../domain/config/configuration.js';
import {
  InvalidArgumentsError,
  InvalidConfigurationError,
} from '../../domain/errors/domain-errors.js';
import type { ConfigurationService } from '../ports/configuration.port.js';

export interface ConfigGetResult {
  key: string;
  value: unknown;
  source: ConfigValueSource;
  scope: ConfigScope | 'effective';
}

export interface ConfigSetResult {
  key: string;
  value: unknown;
  scope: ConfigScope;
  path: string;
}

export const VALID_CONFIG_KEYS: readonly string[] = CONFIG_KEY_LIST;

function unknownKeyMessage(key: string): string {
  return `Unknown configuration key "${key}". Valid keys: ${CONFIG_KEY_LIST.join(', ')}.`;
}

function buildPatch(key: ConfigKey, value: unknown): ConfigurationPatch {
  const [section, field] = splitConfigKey(key);
  const patch = { [section]: { [field]: value } };

  return patch as ConfigurationPatch;
}

export class ManageConfigUseCase {
  constructor(private configService: ConfigurationService) {}

  async get(key: string, repoRoot?: string): Promise<ConfigGetResult> {
    if (!(key in CONFIG_KEYS)) {
      throw new InvalidArgumentsError(unknownKeyMessage(key));
    }

    const configKey = key as ConfigKey;
    const path = configurationPath(configKey);
    const { configuration, sources } = await this.configService.getResolved(repoRoot);
    const source = sources[configKey];

    if (source === undefined) {
      throw new InvalidArgumentsError(
        `Configuration key "${key}" is not set. Valid keys: ${CONFIG_KEY_LIST.join(', ')}.`,
      );
    }

    return {
      key,
      value: getConfigurationValue(configuration, path),
      source,
      scope: 'effective',
    };
  }

  async set(
    key: string,
    rawValue: string,
    options: { scope: ConfigScope; repoRoot?: string },
  ): Promise<ConfigSetResult> {
    if (!(key in CONFIG_KEYS)) {
      throw new InvalidArgumentsError(unknownKeyMessage(key));
    }

    const configKey = key as ConfigKey;
    const coerced = coerceConfigValue(configKey, rawValue);

    if (!coerced.ok) {
      throw new InvalidConfigurationError(coerced.message);
    }

    await this.configService.write(
      options.scope,
      buildPatch(configKey, coerced.value),
      options.repoRoot,
    );

    return {
      key,
      value: coerced.value,
      scope: options.scope,
      path: this.configService.getLocation(options.scope, options.repoRoot),
    };
  }
}
