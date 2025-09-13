export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

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
  mcpServers?: Record<string, McpServerConfig>;
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
