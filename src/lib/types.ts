import { z } from "zod";

export const SupportedAgentSchema = z.enum([
  "gemini",
  "claude",
  "codex",
  "opencode",
]);
export type SupportedAgent = z.infer<typeof SupportedAgentSchema>;

export const McpServerStdioConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
});

export const McpServerHttpConfigSchema = z.object({
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const McpServerConfigSchema = z.union([
  McpServerStdioConfigSchema,
  McpServerHttpConfigSchema,
]);

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const McpServersConfigSchema = z.record(
  z.string(),
  McpServerConfigSchema,
);
export type McpServersConfig = z.infer<typeof McpServersConfigSchema>;

export const TercaBeforeActionSchema = z.union([
  z.object({ copy: z.record(z.string(), z.string()) }),
  z.object({ files: z.record(z.string(), z.string()) }),
  z.object({ command: z.string() }),
]);
export type TercaBeforeAction = z.infer<typeof TercaBeforeActionSchema>;

export const EnvironmentSchema = z.object({
  name: z.string(),
  agent: SupportedAgentSchema.optional(),
  rules: z.string().optional(),
  mcpServers: McpServersConfigSchema.optional(),
  command: z.string().optional(),
  before: z.array(TercaBeforeActionSchema).optional(),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export const ExperimentSchema = z.object({
  name: z.string(),
  agent: SupportedAgentSchema.optional(),
  rules: z.string().optional(),
  mcpServers: McpServersConfigSchema.optional(),
  command: z.string().optional(),
  preamble: z.string().optional(),
  postamble: z.string().optional(),
});
export type Experiment = z.infer<typeof ExperimentSchema>;


export const TercaEvaluatorActionsSchema = z.object({
  commandSuccess: z
    .union([
      z.string(),
      z.object({
        command: z.string(),
        outputContains: z.string(),
      }),
    ])
    .optional(),
  fileExists: z.union([z.string(), z.array(z.string())]).optional(),
});
export type TercaEvaluatorActions = z.infer<typeof TercaEvaluatorActionsSchema>;
export type TercaEvaluatorActionType = keyof TercaEvaluatorActions;

export interface TercaEvaluatorResult {
  /** Score between 0.0 and 1.0 */
  score: number;
  /** Optional message to go along with the score */
  message?: string;
}

export const TercaEvaluatorSchema = TercaEvaluatorActionsSchema.extend({
  name: z.string(),
});
export type TercaEvaluator = z.infer<typeof TercaEvaluatorSchema>;

export const TercaTestSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  prompt: z.string(),
  workspaceDir: z.string().optional(),
  repetitions: z.number().optional(),
  timeoutSeconds: z.number().optional(),
  before: z.array(TercaBeforeActionSchema).optional(),
  eval: z.array(TercaEvaluatorSchema).optional(),
});

export type TercaTest = z.infer<typeof TercaTestSchema>;

export const TercaConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  preamble: z.string().optional(),
  postamble: z.string().optional(),
  workspaceDir: z.string().optional(),
  repetitions: z.number().optional(),
  concurrency: z.number().optional(),
  timeoutSeconds: z.number().optional(),
  before: z.array(TercaBeforeActionSchema).optional(),
  tests: z.array(TercaTestSchema),
  environments: z.array(EnvironmentSchema).optional(),
  experiments: z.array(ExperimentSchema).optional(),
});
export type Config = z.infer<typeof TercaConfigSchema>;

export interface ExpandedMatrix {
  [key: string]: any;
}

export interface AgentRunnerOptions {
  workspaceDir: string;
  artifactsDir: string;
  prompt: string;
  rulesFile?: string;
  mcpServers?: McpServersConfig;
  config?: any;
  signal?: AbortSignal;
  logger?: NodeJS.WritableStream;
}

export interface AgentRunnerStats {
  /** number of requests made to the model */
  requests: number;
  /** total count of input tokens */
  inputTokens: number;
  /** count of input tokens that were cached */
  cachedInputTokens: number;
  /** total count of output tokens */
  outputTokens: number;
  /** how long the runner took in total in seconds */
  durationSeconds: number;
  /** whether the run timed out */
  timedOut?: boolean;
}

export interface AgentRunnerProgress {
  done?: boolean;
  exitCode?: number;
  output?: string;
  /** usage information about the run, only provided on last chunk */
  stats?: AgentRunnerStats;
}

export interface AgentRunner {
  run(options: AgentRunnerOptions): AsyncIterable<AgentRunnerProgress>;
}

export interface RunDisplayState {
  id: number;
  name: string;
  status: "pending" | "running" | "complete" | "error";
  message: string;
  logFile?: string;
  results?: any;
  error?: any;
  stats?: AgentRunnerStats;
}
