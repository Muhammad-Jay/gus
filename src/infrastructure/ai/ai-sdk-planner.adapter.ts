import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { AiPlanner, WorkflowPlanningInput } from '../../application/ports/ai-planner.port.js';
import type { WorkflowPlan } from '../../domain/workflow/workflow-plan.js';
import { WorkflowPlanSchema } from './schemas/workflow-plan.schema.js';
import { createWorkflowPlanningPrompt } from './prompts/workflow-planning.prompt.js';

export class AiSdkPlannerAdapter implements AiPlanner {
  constructor(private model: string = 'gpt-4o-mini') {}

  async plan(input: WorkflowPlanningInput): Promise<WorkflowPlan> {
    const prompt = createWorkflowPlanningPrompt(input);
    
    try {
      const { object } = await generateObject({
        model: openai(this.model),
        schema: WorkflowPlanSchema,
        prompt,
      });
      
      return object as WorkflowPlan;
    } catch (error) {
      throw new Error(`AI planning failed: ${error}`);
    }
  }
}
