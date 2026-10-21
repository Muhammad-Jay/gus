import type {
  RepositoryAdapter,
  RepositoryLocation,
} from '../../application/ports/repository.port.js';

export class RepositoryProviderRegistry {
  private providers: RepositoryAdapter[] = [];

  register(provider: RepositoryAdapter): void {
    this.providers.push(provider);
  }

  async detect(
    cwd: string,
  ): Promise<{ adapter: RepositoryAdapter; location: RepositoryLocation } | null> {
    for (const provider of this.providers) {
      const location = await provider.detect(cwd);
      if (location) {
        return { adapter: provider, location };
      }
    }
    return null;
  }
}
