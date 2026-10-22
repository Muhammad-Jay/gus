import { z } from 'zod';
import {
  AUTOMATION_POLICY_VALUES,
  CONFIG_COLOR_VALUES,
} from '../../domain/config/configuration.js';

export { DEFAULT_CONFIGURATION } from '../../domain/config/configuration.js';

export const ConfigurationSchema = z
  .object({
    ai: z
      .object({
        provider: z.string().optional(),
        model: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
      })
      .strict()
      .optional(),
    workflow: z
      .object({
        autoCommit: z.enum(AUTOMATION_POLICY_VALUES).optional(),
        autoCreateBranch: z.enum(AUTOMATION_POLICY_VALUES).optional(),
        autoStage: z.enum(AUTOMATION_POLICY_VALUES).optional(),
        splitChanges: z.enum(AUTOMATION_POLICY_VALUES).optional(),
        commitStyle: z.string().optional(),
        defaultBranch: z.string().optional(),
      })
      .strict()
      .optional(),
    ui: z
      .object({
        liveUpdates: z.boolean().optional(),
        color: z.enum(CONFIG_COLOR_VALUES).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ValidatedConfiguration = z.infer<typeof ConfigurationSchema>;

export function validateConfiguration(value: unknown): ValidatedConfiguration {
  return ConfigurationSchema.parse(value);
}

export function formatConfigurationIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}
