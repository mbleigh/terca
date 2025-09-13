import { z } from "zod";

export const SupportedAgentSchema = z.enum(["gemini", "claude", "codex", "opencode"]);
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
  agents: z
    .union([SupportedAgentSchema, z.array(SupportedAgentSchema)])
    .optional(),
  rules: z.union([z.string(), z.array(z.string())]).optional(),
  mcpServers: z
    .union([McpServersConfigSchema, z.array(z.union([McpServersConfigSchema, z.null()]))])
    .optional(),
});
export type MatrixEntry = z.infer<typeof MatrixEntrySchema>;

export const TercaBeforeActionSchema = z.union([
  z.object({ copy: z.record(z.string(), z.string()) }),
  z.object({ files: z.record(z.string(), z.string()) }),
  z.object({ command: z.string() }),
]);
export type TercaBeforeAction = z.infer<typeof TercaBeforeActionSchema>;

export const TercaEvaluatorSchema = z.object({
  name: z.string(),
  commandSuccess: z.string(),
});
export type TercaEvaluator = z.infer<typeof TercaEvaluatorSchema>;

export const TercaTestSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  prompt: z.string(),
  before: z.array(TercaBeforeActionSchema).optional(),
  evaluate: z.array(TercaEvaluatorSchema).optional(),
});
export type TercaTest = z.infer<typeof TercaTestSchema>;

export const TercaConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  workspaceDir: z.string().optional(),
  matrix: z.array(MatrixEntrySchema),
  before: z.array(TercaBeforeActionSchema).optional(),
  tests: z.array(TercaTestSchema),
});
export type Config = z.infer<typeof TercaConfigSchema>;

export interface ExpandedMatrix {
  [key: string]: any;
}

export interface AgentRunnerOptions {
  workspaceDir: string;
  prompt: string;
  rulesFile?: string;
  mcpServers?: McpServersConfig;
  config?: any;
}

export interface AgentRunnerProgress {
  done?: boolean;
  exitCode?: number;
  output?: string;
}

export interface AgentRunner {
  run(options: AgentRunnerOptions): AsyncIterable<AgentRunnerProgress>;
}
