# Terca - Test and Eval Runner for Coding Agents

Your goal is to implement a robust "eval runner" for CLI coding agents such that developers can gain confidence in how rules files, MCP servers, and base model capabilities affect working on specific technologies such as an open source library.

I have written an example terca spec in `terca.yaml` -- this contains examples of the configuration that users of Terca will be able to specify.

## Agent Runners

You will create a common `AgentRunner` interface:

```ts
interface AgentRunnerOptions {
  /** directory in which to start the runner */
  workspaceDir: string;
  /** directory in which the agent can store artifacts */
  artifactsDir: string;
  /** prompt with which to start the agent */
  prompt: string;
  /** path to a file containing rules/instructions for the agent */
  rulesFile?: string;
  /** mcp server config with which to run the agent e.g. {firebase: {command: 'firebase', args: ['mcp'], env?: Record<string,string>, cwd?: string}, ...etc} */
  mcpServers?: Record<string, McpServerConfig>;
  /** additional non-standardized config that can be applied to the agent */
  config?: any;
  /** signal to abort the run */
  signal?: AbortSignal;
}

interface AgentRunner {
  run(options: AgentRunnerOptions): AsyncIterable<AgentRunnerProgress>;
}

interface AgentRunnerStats {
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
}

interface AgentRunnerProgress {
  /** true on final chunk of progress */
  done?: boolean;
  /** exit code of the running agent (only populated after completion) */
  exitCode?: number;
  /** if this chunk contains text output, include it here */
  output?: string;
  /** usage information about the run, only provided on last chunk */
  stats?: AgentRunnerStats;
}
```

You will then implement that interface for several CLI coding agents. Start with Gemini CLI `gemini -p "..." --yolo` and we will eventually expand to more once that's working well.

Notes on agent runners:

- You can assume that it's running in a disposable directory where you can write / overwrite settings files at will
- Before spawning a process, you will need to write configuration files to set up the rules, mcp servers, etc for the agent
- Use child_process spawn to run the commands

## Terca Configuration

A `terca.yaml` file is used to configure the test runner. The following options are available:

- `name`: The name of the test suite.
- `description`: A description of the test suite.
- `workspaceDir`: The directory to use as the workspace for all tests.
- `repetitions`: The number of times to run each test.
- `concurrency`: The number of tests to run in parallel.
- `timeoutSeconds`: The number of seconds to wait for a test to complete before timing out.
- `preamble`: A command to run before all tests.
- `postamble`: A command to run after all tests.
- `before`: A list of actions to run before each test.
- `tests`: A list of tests to run.
- `environments`: A list of environments to run the tests in.
- `experiments`: A list of experiments to run the tests in.

### Environments and Experiments

The `environments` and `experiments` sections allow you to define a matrix of configurations to run your tests against. The configurations are combined to create a list of test runs.

An `environment` defines a set of configurations that are related to the environment in which the tests are run, such as the agent, rules, and MCP servers.

An `experiment` defines a set of configurations that are related to the experiment you are running, such as the agent, rules, and command.

### Before Actions

The `before` section allows you to run a list of actions before each test. The following actions are available:

- `copy`: Copy a file or directory. The value is a map of source to destination.
- `files`: Create a file with the given content. The value is a map of filename to content.
- `command`: Run a command.

### Evaluators

The `eval` section allows you to define a list of evaluators to run after each test. The following evaluators are available:

- `commandSuccess`: Check if a command runs successfully. The value can be a string with the command to run, or an object with a `command` and an `outputContains` string.
- `fileExists`: Check if a file or list of files exists.

## Terca CLI

- `terca` in directory with a `terca.yaml` should start the test runner and run the tests in it
- `terca -t <test_name>` or `terca --test <test_name>` should run only the specified test.
- `terca -x <experiment_name>` or `terca --experiment <experiment_name>` should run only the specified experiment.
- it should provide nicely formatted and colored progress output as each test runs
- it should create a `.terca/runs/YYYY-MM-DD-NNN` directory when it starts running where NNN is numbered sequentially based on existing dirs
- inside that dir, it should keep log files containing full output for each of the matrix runs
- it should also keep a running `results.json` file containing test results for each named test/eval
- eval scores are colored based on the result: green for 1.0 (pass), yellow for scores between 0.0 and 1.0 (partial), and red for 0.0 (fail).
- tests are run in parallel with a configurable concurrency level.
- it should show high-level status updates for each running test. Full agent output is streamed to log files.
- when all tests are complete, it should show a nice table of output displaying the contents of `results.json`

## Technologies

- TypeScript for code, Node.js for runtime
- Don't install packages for parsing command line args, just use stdlib stuff
- put logic code in `src/lib` and cli code in `src/cli` -- cli code should be minimal and mostly related to running and displaying code from lib
- use vitest for unit testing. prefer table-style tests where possible.