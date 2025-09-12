# Terca - Test and Eval Runner for Coding Agents

Your goal is to implement a robust "eval runner" for CLI coding agents such that developers can gain confidence in how rules files, MCP servers, and base model capabilities affect working on specific technologies such as an open source library.

I have written an example terca spec in `terca.yaml` -- this contains examples of the configuration that users of Terca will be able to specify.

## Agent Runners

You will create a common `AgentRunner` interface:

```ts
interface AgentRunnerOptions<
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

interface AgentRunner<
  ProviderConfig extends Record<string, unknown> = Record<string, unknown>
> {
  run(options: AgentRunnerOptions): AsyncIterable<AgentRunnerProgress>;
}

interface AgentRunnerProgress {
  /** true on final chunk of progress */
  done?: boolean;
  /** exit code of the running agent (only populated after completion) */
  exitCode?: number;
  /** if this chunk contains text output, include it here */
  output?: string;
}
```

You will then implement that interface for several CLI coding agents. Start with Gemini CLI `gemini -p "..." --yolo` and we will eventually expand to more once that's working well.

Notes on agent runners:

- You can assume that it's running in a disposable directory where you can write / overwrite settings files at will
- Before spawning a process, you will need to write configuration files to set up the rules, mcp servers, etc for the agent
- Use child_process spawn to run the commands

## Terca CLI

- `terca` in directory with a `terca.yaml` should start the test runner and run the tests in it
- it should provide nicely formatted and colored progress output as each test runs
- it should create a `.terca/runs/YYYY-MM-DD-NNN` directory when it starts running where NNN is numbered sequentially based on existing dirs
- inside that dir, it should keep log files containing full output for each of the matrix runs
- it should also keep a running `results.json` file containing test results for each named test/eval
- consider eval scores of >0.7 green, >0.5 yellow, and <0.5 red for display purposes
- running one agent at a time is fine for now
- ideally, it should show a running "window" of ~10 lines of output from the current agent running
- when all tests are complete, it should show a nice table of output displaying the contents of `results.json`

## Technologies

- TypeScript for code, Node.js for runtime
- Don't install packages for parsing command line args, just use stdlib stuff
- put logic code in `src/lib` and cli code in `src/cli` -- cli code should be minimal and mostly related to running and displaying code from lib
- use vitest for unit testing. prefer table-style tests where possible.
