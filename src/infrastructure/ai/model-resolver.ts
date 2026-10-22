import type { LanguageModelV1 } from 'ai';
import type { AiPlanner } from '../../application/ports/ai-planner.port.js';
import type { Configuration } from '../../domain/config/configuration.js';
import { InvalidConfigurationError } from '../../domain/errors/domain-errors.js';
import type { AiProviderRegistry } from './ai-provider-registry.js';

export interface ResolvedAi {
  provider: string;
  modelId: string;
  model: LanguageModelV1;
  planner: AiPlanner;
  temperature?: number;
}

export class ModelResolver {
  constructor(private readonly registry: AiProviderRegistry) {}

  resolve(configuration: Configuration): ResolvedAi {
    const providerName = configuration.ai?.provider;
    if (providerName === undefined || providerName.trim() === '') {
      throw new InvalidConfigurationError(
        `No AI provider is configured. Set "ai.provider" to one of: ${this.describeProviders()}.`,
      );
    }

    const provider = this.registry.get(providerName);
    if (provider === undefined) {
      throw new InvalidConfigurationError(
        `Unknown AI provider "${providerName}". Supported providers: ${this.describeProviders()}.`,
      );
    }

    const modelId = configuration.ai?.model ?? provider.defaultModel;
    const temperature = configuration.ai?.temperature;

    return {
      provider: provider.name,
      modelId,
      model: provider.createModel(modelId),
      planner: provider.createPlanner({ modelId, temperature }),
      temperature,
    };
  }

  private describeProviders(): string {
    const providers = this.registry.list();
    return providers.length > 0 ? providers.join(', ') : 'none';
  }
}
