import { z } from "zod";

export const SupportedAgentSchema = z.enum(["gemini"]); // more later
export type SupportedAgent = z.infer<typeof SupportedAgentSchema>;

export const McpServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
});
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const McpServersConfigSchema = z.record(z.string(), McpServerConfigSchema);
export type McpServersConfig = z.infer<typeof McpServersConfigSchema>;

export const MatrixEntrySchema = z.object({
  agent: z
    .union([SupportedAgentSchema, z.array(SupportedAgentSchema)])
    .optional(),
  rulesFile: z.union([z.string(), z.array(z.string())]).optional(),
  mcpServers: z.union([McpServersConfigSchema, z.array(z.union([McpServersConfigSchema, z.null()]))]).optional(),
});
export type MatrixEntry = z.infer<typeof MatrixEntrySchema>;

export const TercaBeforeActionSchema = z.union([
  z.object({ copy: z.record(z.string(), z.string()) }),
  z.object({ files: z.record(z.string(), z.string()) }),
  z.object({ command: z.array(z.string()) }),
]);
export type TercaBeforeAction = z.infer<typeof TercaBeforeActionSchema>;

export const TercaEvaluatorSchema = z.object({
  commandSuccess: z.object({
    command: z.array(z.string()),
  }),
});
export type TercaEvaluator = z.infer<typeof TercaEvaluatorSchema>;

export const TercaEvaluationSchema = z.object({
  prompt: z.string(),
  evaluator: TercaEvaluatorSchema,
});
export type TercaEvaluation = z.infer<typeof TercaEvaluationSchema>;

export const TercaTestSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  before: z.array(TercaBeforeActionSchema).optional(),
  evals: z.array(TercaEvaluationSchema),
});
export type TercaTest = z.infer<typeof TercaTestSchema>;

export const TercaConfigSchema = z.object({
  matrix: z.array(MatrixEntrySchema),
  tests: z.record(z.string(), TercaTestSchema),
});
export type TercaConfig = z.infer<typeof TercaConfigSchema>;

export interface AgentRunnerOptions<
  ProviderConfig extends Record<string, unknown> = Record<string, unknown>
> {
  /** directory in which to start the runner */
  workspaceDir: string;
  /** prompt with which to start the agent */
  prompt: string;
  /** path to a file containing rules/instructions for the agent */
  rulesFile?: string;
  /** mcp server config with which to run the agent e.g. {firebase: {command: 'firebase', args: ['mcp'], env?: Record<string,string>, cwd?: string}, ...etc} */
  mcpServers?: McpServersConfig;
  /** additional non-standardized config that can be applied to the agent */
  config?: ProviderConfig;
}

export interface AgentRunner<
  ProviderConfig extends Record<string, unknown> = Record<string, unknown>
> {
  run(options: AgentRunnerOptions): AsyncIterable<AgentRunnerProgress>;
}

export interface AgentRunnerProgress {
  /** true on final chunk of progress */
  done?: boolean;
  /** exit code of the running agent (only populated after completion) */
  exitCode?: number;
  /** if this chunk contains text output, include it here */
  output?: string;
}