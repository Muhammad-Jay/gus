import { z } from 'zod';

export const ConfigurationSchema = z.object({
  ai: z
    .object({
      provider: z.string().optional(),
      model: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
    })
    .optional(),
  workflow: z
    .object({
      autoCommit: z.enum(['allow', 'ask', 'deny']).optional(),
      autoCreateBranch: z.enum(['allow', 'ask', 'deny']).optional(),
      autoStage: z.enum(['allow', 'ask', 'deny']).optional(),
      splitChanges: z.enum(['allow', 'ask', 'deny']).optional(),
      commitStyle: z.string().optional(),
      defaultBranch: z.string().optional(),
    })
    .optional(),
  ui: z
    .object({
      liveUpdates: z.boolean().optional(),
      color: z.enum(['auto', 'always', 'never']).optional(),
    })
    .optional(),
});

export type ValidatedConfiguration = z.infer<typeof ConfigurationSchema>;
