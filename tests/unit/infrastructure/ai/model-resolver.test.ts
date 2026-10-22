import { describe, expect, it } from 'vitest';
import { InvalidConfigurationError } from '../../../../src/domain/errors/domain-errors';
import { AiProviderRegistry } from '../../../../src/infrastructure/ai/ai-provider-registry';
import { OpenAiProvider } from '../../../../src/infrastructure/ai/ai-provider.openai';
import { ModelResolver } from '../../../../src/infrastructure/ai/model-resolver';

function createResolver(): ModelResolver {
  const registry = new AiProviderRegistry();
  registry.register(new OpenAiProvider({ apiKey: 'test-key', defaultModel: 'gpt-4o-mini' }));
  return new ModelResolver(registry);
}

describe('ModelResolver', () => {
  it('resolves the configured provider and model', () => {
    const resolved = createResolver().resolve({
      ai: { provider: 'openai', model: 'gpt-4o', temperature: 0.2 },
    });

    expect(resolved.provider).toBe('openai');
    expect(resolved.modelId).toBe('gpt-4o');
    expect(resolved.temperature).toBe(0.2);
    expect(resolved.model).toBeDefined();
    expect(resolved.planner).toBeDefined();
  });

  it('falls back to the provider default model', () => {
    const resolved = createResolver().resolve({ ai: { provider: 'openai' } });

    expect(resolved.modelId).toBe('gpt-4o-mini');
  });

  it('rejects an unknown provider', () => {
    expect(() => createResolver().resolve({ ai: { provider: 'nope' } })).toThrow(
      InvalidConfigurationError,
    );
  });

  it('rejects a missing provider', () => {
    expect(() => createResolver().resolve({})).toThrow(InvalidConfigurationError);
  });
});

describe('AiProviderRegistry', () => {
  it('lists and checks registered providers', () => {
    const registry = new AiProviderRegistry();
    registry.register(new OpenAiProvider({ apiKey: 'test-key' }));

    expect(registry.list()).toEqual(['openai']);
    expect(registry.has('openai')).toBe(true);
    expect(registry.has('other')).toBe(false);
  });
});
