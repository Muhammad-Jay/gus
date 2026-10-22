import type { ConfigValueSource } from '../../domain/config/configuration.js';
import type { ConfigurationService } from '../ports/configuration.port.js';

export interface ModelInfo {
  provider: string;
  modelId: string;
  source: ConfigValueSource;
  providerAvailable: boolean;
}

export interface ListModelsResult {
  configured: ModelInfo;
  supportedProviders: string[];
  notes: string[];
}

export interface ProviderCatalog {
  list(): string[];
  has(name: string): boolean;
}

export class ListModelsUseCase {
  constructor(
    private configService: ConfigurationService,
    private providerCatalog: ProviderCatalog,
  ) {}

  async list(repoRoot?: string): Promise<ListModelsResult> {
    const { configuration, sources } = await this.configService.getResolved(repoRoot);

    const provider = configuration.ai?.provider ?? '';
    const modelId = configuration.ai?.model ?? '';
    const source = sources['ai.model'] ?? 'default';
    const supportedProviders = this.providerCatalog.list();
    const providerAvailable = this.providerCatalog.has(provider);

    const notes = [
      `The ${provider || 'configured'} provider SDK does not publish a model catalogue, so only the configured model and the supported providers are listed.`,
    ];

    if (!providerAvailable) {
      notes.push(
        `Provider "${provider}" is not supported. Supported providers: ${
          supportedProviders.length > 0 ? supportedProviders.join(', ') : 'none'
        }.`,
      );
    }

    return {
      configured: {
        provider,
        modelId,
        source,
        providerAvailable,
      },
      supportedProviders,
      notes,
    };
  }
}
