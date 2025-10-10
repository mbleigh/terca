import { expandMatrix, loadConfig } from "./config.js";
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
}) {
  const config = await loadConfig();
  const matrix = expandMatrix(config.matrix);
  const runDir = await createRunDir();
  const concurrency = options.concurrency || config.concurrency || 3;

  printHeader(`Terca Run: ${runDir}`);

  const allTestRuns = [];
  let runId = 0;
  const suiteRepetitions = options.repetitions || config.repetitions || 1;

  for (const test of config.tests) {
    const testRepetitions = test.repetitions || 1;
    const totalRepetitions = suiteRepetitions * testRepetitions;
    for (let i = 0; i < totalRepetitions; i++) {
      for (const m of matrix) {
        runId++;
        allTestRuns.push({
          id: runId,
          test,
          matrix: m,
          name: `${test.name} (repetition ${i + 1})`,
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
      let line = `${state.id.toString().padStart(3, "0")}: `;
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

  async function worker() {
    while (queue.length > 0) {
      const run = queue.shift()!;
      const runState = runStates.find((s) => s.id === run.id)!;

      try {
        const { evalResult, stats } = await runTest(
          runDir,
          config,
          run.test,
          run.matrix,
          run.id,
          runState,
        );

        runState.status = "complete";
        runState.message = "complete";
        runState.results = evalResult;

        results.runs.push({
          id: run.id,
          test: run.test.name,
          matrix: run.matrix,
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
          matrix: run.matrix,
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
  matrix: ExpandedMatrix,
  runId: number,
  runState: RunDisplayState,
) {
  const testRunDir = await setupTestRunDir(runDir, test, runId);
  runState.logFile = path.join(testRunDir, "run.log");
  const logStream = createWriteStream(runState.logFile);
  const artifactsDir = path.join(testRunDir, "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });

  try {
    const workspaceDir = await setupWorkspace(testRunDir, config);
    await runBeforeActions(workspaceDir, config, test, logStream, runState);
    await runMatrixCommand(workspaceDir, matrix, logStream, runState);
    const stats = await runAgent(
      workspaceDir,
      artifactsDir,
      test,
      matrix,
      logStream,
      runState,
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
  runId: number,
): Promise<string> {
  // Sanitize test name for directory
  const sanitizedTestName = test.name.replace(/[\W_]+/g, "-").toLowerCase();

  // Create a unique temporary directory for the test run
  const tempDirPrefix = path.join(os.tmpdir(), `terca-${sanitizedTestName}-`);
  const testRunTempDir = await fs.mkdtemp(tempDirPrefix);

  // This is where the symlink will live, inside the .terca directory structure
  const symlinkPath = path.join(runDir, runId.toString());

  // Create a symlink from the .terca directory to the temporary directory
  await fs.symlink(testRunTempDir, symlinkPath, "dir");

  // Return the path to the temporary directory, which will be used as the test run directory
  return testRunTempDir;
}

async function setupWorkspace(
  testRunDir: string,
  config: Config,
): Promise<string> {
  const workspaceDir = path.join(testRunDir, "workspace");
  if (!config.workspaceDir) {
    await fs.mkdir(workspaceDir, { recursive: true });
    return workspaceDir;
  }
  await fs.cp(config.workspaceDir, workspaceDir, { recursive: true });
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
        await fs.cp(src, path.join(workspaceDir, dest), {
          recursive: true,
        });
      }
    } else if ("files" in action) {
      runState.message = `before: writing files`;
      for (const [dest, content] of Object.entries(action.files)) {
        await fs.writeFile(path.join(workspaceDir, dest), content);
      }
    }
  }
}

async function runMatrixCommand(
  workspaceDir: string,
  matrix: ExpandedMatrix,
  logStream: NodeJS.WritableStream,
  runState: RunDisplayState,
) {
  const command = matrix.command as string | undefined;
  if (!command) {
    return;
  }

  runState.message = `matrix: running \`${command}\``;
  logStream.write(`
--- Running matrix command: ${command} ---
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
--- End of matrix command: ${command} ---
`);
}

async function runAgent(
  workspaceDir: string,
  artifactsDir: string,
  test: TercaTest,
  matrix: ExpandedMatrix,
  logStream: NodeJS.WritableStream,
  runState: RunDisplayState,
): Promise<AgentRunnerStats | undefined> {
  const agent = matrix.agent as string;
  const Runner = AGENT_RUNNERS[agent];
  if (!Runner) {
    console.log(`Unknown agent: ${agent}, skipping`);
    return;
  }
  const runner = new Runner();
  runState.message = `agent \`${agent}\` running...`;

  // TODO: Create temporary files for rules and mcpServers
  const runnerOpts = {
    workspaceDir,
    artifactsDir,
    prompt: test.prompt,
    rulesFile: matrix.rules as string | undefined,
    mcpServers: matrix.mcpServers as any,
  };

  let stats: AgentRunnerStats | undefined;
  logStream.write(`
--- Running agent: ${agent} ---
`);
  for await (const progress of runner.run(runnerOpts)) {
    if (progress.output) {
      logStream.write(progress.output);
    }
    if (progress.stats) {
      stats = progress.stats;
    }
  }
  logStream.write(`
--- End of agent: ${agent} ---
`);
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
