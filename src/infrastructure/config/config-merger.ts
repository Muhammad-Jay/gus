import type { Configuration } from '../../application/ports/configuration.port.js';

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
