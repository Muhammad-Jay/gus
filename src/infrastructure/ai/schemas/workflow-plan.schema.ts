import { z } from 'zod';

export const CommitGroupSchema = z.object({
  message: z.string().min(1),
  files: z.array(z.string()).min(1),
  explanation: z.string().optional(),
});

export const BranchDecisionSchema = z.object({
  strategy: z.enum(['current', 'new']),
  name: z.string().optional(),
  reason: z.string(),
});

export const WorkflowPlanSchema = z.object({
  summary: z.string(),
  branch: BranchDecisionSchema,
  commits: z.array(CommitGroupSchema).min(1),
  warnings: z.array(z.string()).default([]),
});

export type ValidatedWorkflowPlan = z.infer<typeof WorkflowPlanSchema>;
