import type {
  Configuration,
  ConfigurationPatch,
} from '../../application/ports/configuration.port.js';

export function mergeConfigurations(...configs: Configuration[]): Configuration {
  const result: Configuration = {};

  for (const config of configs) {
    if (config.ai) {
      result.ai = { ...result.ai, ...config.ai };
    }
    if (config.workflow) {
      result.workflow = { ...result.workflow, ...config.workflow };
    }
    if (config.ui) {
      result.ui = { ...result.ui, ...config.ui };
    }
  }

  return result;
}

export function mergeConfigurationPatch(
  base: Configuration,
  patch: ConfigurationPatch,
): Configuration {
  const result: Configuration = {
    ...(base.ai ? { ai: { ...base.ai } } : {}),
    ...(base.workflow ? { workflow: { ...base.workflow } } : {}),
    ...(base.ui ? { ui: { ...base.ui } } : {}),
  };

  if (patch.ai) {
    result.ai = { ...result.ai, ...patch.ai };
  }
  if (patch.workflow) {
    result.workflow = { ...result.workflow, ...patch.workflow };
  }
  if (patch.ui) {
    result.ui = { ...result.ui, ...patch.ui };
  }

  return result;
}
