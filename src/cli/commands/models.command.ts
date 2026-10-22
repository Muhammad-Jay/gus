import { Command } from 'commander';
import { ListModelsUseCase } from '../../application/use-cases/list-models.use-case.js';
import { createConfigService, createProviderRegistry } from '../composition.js';

export function modelsCommand(): Command {
  const command = new Command('models');
  command.description('Show the configured AI provider and model');

  command.action(async () => {
    const useCase = new ListModelsUseCase(createConfigService(), createProviderRegistry());
    const result = await useCase.list();

    console.log(`Provider: ${result.configured.provider || '(not set)'}`);
    console.log(`Model: ${result.configured.modelId || '(not set)'} (${result.configured.source})`);

    if (result.supportedProviders.length > 0) {
      console.log(`Supported providers: ${result.supportedProviders.join(', ')}`);
    }

    for (const note of result.notes) {
      console.log(`Note: ${note}`);
    }
  });

  return command;
}
