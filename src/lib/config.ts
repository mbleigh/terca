import fs from "fs";
import yaml from "yaml";
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

export const McpServersConfigSchema = z.record(
  z.string(),
  McpServerConfigSchema
);
export type McpServersConfig = z.infer<typeof McpServersConfigSchema>;

export const MatrixEntrySchema = z.object({
  agent: z
    .union([SupportedAgentSchema, z.array(SupportedAgentSchema)])
    .optional(),
  rulesFile: z.union([z.string(), z.array(z.string())]).optional(),
  mcpServers: McpServersConfigSchema.optional(),
});
export type MatrixEntry = z.infer<typeof MatrixEntrySchema>;

export const TercaBeforeActionSchema = z.union([
  z.object({ copy: z.record(z.string()) }),
  z.object({ files: z.record(z.string()) }),
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
  tests: z.array(TercaTestSchema),
});
export type TercaConfig = z.infer<typeof TercaConfigSchema>;

export function loadConfig(file: string): TercaConfig {
  const content = fs.readFileSync(file, "utf-8");
  const data = yaml.parse(content);
  return TercaConfigSchema.parse(data);
}

export function expandMatrix(matrix: MatrixEntry[]): Record<string, any>[] {
  let results: Record<string, any>[] = [{}];

  for (const entry of matrix) {
    const newResults: Record<string, any>[] = [];
    const entryKeys = Object.keys(entry) as (keyof MatrixEntry)[];

    for (const result of results) {
      const combinations = cartesianProduct(entry, entryKeys);
      for (const combination of combinations) {
        newResults.push({ ...result, ...combination });
      }
    }
    results = newResults;
  }

  return results;
}

function cartesianProduct(
  entry: MatrixEntry,
  keys: (keyof MatrixEntry)[]
): Record<string, any>[] {
  let results: Record<string, any>[] = [{}];

  for (const key of keys) {
    const newResults: Record<string, any>[] = [];
    const values = Array.isArray(entry[key])
      ? (entry[key] as any[])
      : [entry[key]];

    for (const result of results) {
      for (const value of values) {
        newResults.push({ ...result, [key]: value });
      }
    }
    results = newResults;
  }

  return results;
}
