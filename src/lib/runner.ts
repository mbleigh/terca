import { expandEnvironmentsAndExperiments, loadConfig } from "./config.js";
import { GeminiAgentRunner } from "./runners/gemini.js";
import { ClaudeAgentRunner } from "./runners/claude.js";
import { CodexAgentRunner } from "./runners/codex.js";
import { OpencodeAgentRunner } from "./runners/opencode.js";
import {
  AgentRunner,
  AgentRunnerStats,
  Config,
  ExpandedMatrix,
  TercaTest,
} from "./types.js";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { spawn } from "child_process";
import { printHeader, printResults } from "./ui.js";
import * as evalActions from "./eval-actions.js";
import logUpdate from "log-update";

const AGENT_RUNNERS: Record<string, new () => AgentRunner> = {
  gemini: GeminiAgentRunner,
  claude: ClaudeAgentRunner,
  codex: CodexAgentRunner,
  opencode: OpencodeAgentRunner,
};

interface RunDisplayState {
  id: number;
  name: string;
  status: "pending" | "running" | "complete" | "error";
  message: string;
  logFile?: string;
  results?: any;
  error?: any;
}

export async function runTests(options: {
  repetitions?: number;
  concurrency?: number;
  signal?: AbortSignal;
}) {
  const config = await loadConfig();
  const variants = expandEnvironmentsAndExperiments(config);
  const runDir = await createRunDir();
  const concurrency = options.concurrency || config.concurrency || 3;

  printHeader(`Terca Run: ${runDir}`);

  const allTestRuns = [];
  let runId = 0;
  const suiteRepetitions = options.repetitions || config.repetitions || 1;

  for (const test of config.tests) {
    const testRepetitions = test.repetitions || 1;
    const totalRepetitions = suiteRepetitions * testRepetitions;
    for (const variant of variants) {
      for (let i = 0; i < totalRepetitions; i++) {
        runId++;
        const repetition = i + 1;
        allTestRuns.push({
          id: runId,
          test,
          variant,
          repetition,
          name: `${test.name} (${variant.environment}.${
            variant.experiment
          } rep ${repetition})`,
        });
      }
    }
  }

  const runStates: RunDisplayState[] = allTestRuns.map((run) => ({
    id: run.id,
    name: run.name,
    status: "pending",
    message: "(pending)",
  }));

  const renderInterval = setInterval(() => {
    let output = `=== ${config.name || "Terca"} ===\n`;
    output += `see ${path.join(runDir, "results.json")}\n`;

    for (const state of runStates) {
      let line = `${state.id.toString().padStart(3, "0")} ${state.name}: `;
      if (state.status === "complete") {
        const passed = Object.values(state.results || {}).filter(
          (r) => (r as number) > 0,
        ).length;
        const total = Object.values(state.results || {}).length;
        line += `complete\n`;
        if (state.logFile) {
          line += `  - log: ${state.logFile}\n`;
        }
        if (total > 0) {
          line += `  - results: ${passed}/${total} passed\n`;
        }
      } else if (state.status === "error") {
        line += `error: ${state.error?.message}\n`;
        if (state.logFile) {
          line += `  - log: ${state.logFile}\n`;
        }
      } else {
        line += `${state.message}\n`;
        if (state.logFile) {
          line += `  - log: ${state.logFile}\n`;
        }
      }
      output += line;
    }
    logUpdate(output);
  }, 100);

  const results: { runs: any[] } = { runs: [] };
  const resultsFile = path.join(runDir, "results.json");
  const queue = [...allTestRuns];

  options.signal?.addEventListener("abort", () => {
    // Stop any new tests from running
    queue.length = 0;
    logUpdate("\nCtrl+C received, finishing in-progress tests...\n");
  });

  async function worker() {
    while (queue.length > 0) {
      const run = queue.shift()!;
      const runState = runStates.find((s) => s.id === run.id)!;

      try {
        const { evalResult, stats } = await runTest(
          runDir,
          config,
          run.test,
          run.variant,
          run.id,
          run.repetition,
          runState,
          options.signal,
        );

        runState.status = "complete";
        runState.message = "complete";
        runState.results = evalResult;

        results.runs.push({
          id: run.id,
          test: run.test.name,
          environment: run.variant.environment,
          experiment: run.variant.experiment,
          repetition: run.repetition,
          variant: run.variant,
          results: evalResult,
          stats,
        });
      } catch (e: any) {
        runState.status = "error";
        runState.message = `error: ${e.message}`;
        runState.error = e;
        results.runs.push({
          id: run.id,
          test: run.test.name,
          environment: run.variant.environment,
          experiment: run.variant.experiment,
          repetition: run.repetition,
          variant: run.variant,
          error: {
            message: e.message,
            stack: e.stack,
          },
        });
      } finally {
        // This is not perfectly atomic, but should be fine for this use case.
        await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  await new Promise((resolve) => setTimeout(resolve, 500));

  clearInterval(renderInterval);
  logUpdate.clear();
  console.log(
    `\n=== Terca Run Complete: ${runDir} ===\nSee ${resultsFile} for full results.\n`,
  );

  printResults(results);
}

async function runTest(
  runDir: string,
  config: Config,
  test: TercaTest,
  variant: Record<string, any>,
  runId: number,
  repetition: number,
  runState: RunDisplayState,
  signal?: AbortSignal,
) {
  const testRunDir = await setupTestRunDir(runDir, test, variant, repetition);
  runState.logFile = path.join(testRunDir, "run.log");
  const logStream = createWriteStream(runState.logFile);
  const artifactsDir = path.join(testRunDir, "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });

  try {
    const workspaceDir = await setupWorkspace(testRunDir, config, test);
    await runBeforeActions(workspaceDir, config, test, logStream, runState);
    await runVariantCommand(workspaceDir, variant, logStream, runState);
    const stats = await runAgent(
      workspaceDir,
      artifactsDir,
      config,
      test,
      variant,
      logStream,
      runState,
      signal,
    );
    const evalResult = await evaluate(workspaceDir, test, logStream, runState);
    return { evalResult, stats };
  } finally {
    logStream.close();
  }
}

async function createRunDir(): Promise<string> {
  const date = new Date();
  const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
  let i = 1;
  let runDir: string;

  const baseDir = path.join(".terca", "runs");
  await fs.mkdir(baseDir, { recursive: true }); // Ensure base directory exists

  while (true) {
    runDir = path.join(baseDir, `${dateStr}-${i.toString().padStart(3, "0")}`);
    try {
      await fs.mkdir(runDir); // Don't use recursive here
      return runDir;
    } catch (e: any) {
      if (e.code === "EEXIST") {
        i++;
        continue;
      }
      throw e;
    }
  }
}

async function setupTestRunDir(
  runDir: string,
  test: TercaTest,
  variant: Record<string, any>,
  repetition: number,
): Promise<string> {
  const repetitionStr = repetition.toString().padStart(2, "0");
  const sanitizedTestName = `${variant.environment}.${
    variant.experiment
  }.${repetitionStr}`;

  // This is where the symlink will live, inside the .terca directory structure
  const symlinkPath = path.join(runDir, sanitizedTestName);

  // Create a unique temporary directory for the test run
  const tempDirPrefix = path.join(os.tmpdir(), `terca-${sanitizedTestName}-`);
  const testRunTempDir = await fs.mkdtemp(tempDirPrefix);

  // Create a symlink from the .terca directory to the temporary directory
  await fs.symlink(testRunTempDir, symlinkPath, "dir");

  // Return the path to the temporary directory, which will be used as the test run directory
  return testRunTempDir;
}

async function setupWorkspace(
  testRunDir: string,
  config: Config,
  test: TercaTest,
): Promise<string> {
  const workspaceDir = path.join(testRunDir, "workspace");
  const sourceDir = test.workspaceDir || config.workspaceDir;
  if (!sourceDir) {
    await fs.mkdir(workspaceDir, { recursive: true });
    return workspaceDir;
  }
  await fs.cp(sourceDir, workspaceDir, { recursive: true });
  return workspaceDir;
}

async function runBeforeActions(
  workspaceDir: string,
  config: Config,
  test: TercaTest,
  logStream: NodeJS.WritableStream,
  runState: RunDisplayState,
) {
  const actions = [...(config.before || []), ...(test.before || [])];
  for (const action of actions) {
    if ("command" in action) {
      runState.message = `before: running \`${action.command}\``;
      logStream.write(`
--- Running before command: ${action.command} ---
`);
      const [cmd, ...args] = action.command.split(" ");
      const proc = spawn(cmd, args, {
        cwd: workspaceDir,
        stdio: "pipe",
      });
      proc.stdout?.pipe(logStream, { end: false });
      proc.stderr?.pipe(logStream, { end: false });
      await new Promise((resolve) => {
        proc.on("close", resolve);
      });
      logStream.write(`
--- End of before command: ${action.command} ---
`);
    } else if ("copy" in action) {
      runState.message = `before: copying files`;
      for (const [src, dest] of Object.entries(action.copy)) {
        await fs.cp(src as string, path.join(workspaceDir, dest as string), {
          recursive: true,
        });
      }
    } else if ("files" in action) {
      runState.message = `before: writing files`;
      for (const [dest, content] of Object.entries(action.files)) {
        await fs.writeFile(
          path.join(workspaceDir, dest as string),
          content as string,
        );
      }
    }
  }
}

async function runVariantCommand(
  workspaceDir: string,
  variant: Record<string, any>,
  logStream: NodeJS.WritableStream,
  runState: RunDisplayState,
) {
  const command = variant.command as string | undefined;
  if (!command) {
    return;
  }

  runState.message = `variant: running \`${command}\``;
  logStream.write(`
--- Running variant command: ${command} ---
`);
  const [cmd, ...args] = command.split(" ");
  const proc = spawn(cmd, args, {
    cwd: workspaceDir,
    stdio: "pipe",
  });
  proc.stdout?.pipe(logStream, { end: false });
  proc.stderr?.pipe(logStream, { end: false });
  await new Promise((resolve) => {
    proc.on("close", resolve);
  });
  logStream.write(`
--- End of variant command: ${command} ---
`);
}

async function runAgent(
  workspaceDir: string,
  artifactsDir: string,
  config: Config,
  test: TercaTest,
  variant: Record<string, any>,
  logStream: NodeJS.WritableStream,
  runState: RunDisplayState,
  parentSignal?: AbortSignal,
): Promise<AgentRunnerStats | undefined> {
  const agent = variant.agent as string;
  const Runner = AGENT_RUNNERS[agent];
  if (!Runner) {
    console.log(`Unknown agent: ${agent}, skipping`);
    return;
  }
  const runner = new Runner();
  runState.message = `agent \`${agent}\` running...`;

  const prompt = [config.preamble, test.prompt, config.postamble]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const controller = new AbortController();
  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener("abort", () => {
        controller.abort();
      });
    }
  }

  const timeoutSeconds = test.timeoutSeconds || config.timeoutSeconds || 300;
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutSeconds * 1000);

  // TODO: Create temporary files for rules and mcpServers
  const runnerOpts = {
    workspaceDir,
    artifactsDir,
    prompt,
    rulesFile: variant.rules as string | undefined,
    mcpServers: variant.mcpServers as any,
    signal: controller.signal,
    logger: logStream,
  };

  let stats: AgentRunnerStats | undefined;
  logStream.write(`
--- Running agent: ${agent} ---
`);
  try {
    for await (const progress of runner.run(runnerOpts)) {
      if (progress.output) {
        logStream.write(progress.output);
      }
      if (progress.stats) {
        stats = progress.stats;
      }
    }
  } finally {
    clearTimeout(timeout);
  }
  logStream.write(`
--- End of agent: ${agent} ---
`);
  if (timedOut && stats) {
    stats.timedOut = true;
  }
  return stats;
}

async function evaluate(
  workspaceDir: string,
  test: TercaTest,
  logStream: NodeJS.WritableStream,
  runState: RunDisplayState,
) {
  const results: any = {};
  const evalCtx: evalActions.EvalActionContext = {
    workspaceDir,
    test,
    logStream,
  };

  for (const [i, evalStep] of (test.eval || []).entries()) {
    runState.message = `evaluating: ${evalStep.name} (${i + 1}/${
      test.eval?.length
    })`;
    if (evalStep.commandSuccess) {
      const result = await evalActions.commandSuccess(
        evalCtx,
        evalStep.commandSuccess,
      );
      results[evalStep.name] = result.score;
    } else if (evalStep.fileExists) {
      const result = await evalActions.fileExists(evalCtx, evalStep.fileExists);
      results[evalStep.name] = result.score;
    }
  }
  return results;
}
