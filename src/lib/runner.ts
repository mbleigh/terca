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
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { spawn } from "child_process";
import {
  printHeader,
  printAgentOutput,
  printResults,
  printEvalSummary,
} from "./ui.js";
import * as evalActions from "./eval-actions.js";

const AGENT_RUNNERS: Record<string, new () => AgentRunner> = {
  gemini: GeminiAgentRunner,
  claude: ClaudeAgentRunner,
  codex: CodexAgentRunner,
  opencode: OpencodeAgentRunner,
};

export async function runTests() {
  const config = await loadConfig();
  const matrix = expandMatrix(config.matrix);
  const runDir = await createRunDir();

  printHeader(`Terca Run: ${runDir}`);

  const results: { runs: any[] } = { runs: [] };
  const resultsFile = path.join(runDir, "results.json");

  let runId = 0;
  for (const test of config.tests) {
    for (const m of matrix) {
      runId++;
      printHeader(`Running test: ${test.name} (#${runId})`);
      try {
        const { evalResult, stats } = await runTest(
          runDir,
          config,
          test,
          m,
          runId,
        );
        results.runs.push({
          id: runId,
          test: test.name,
          matrix: m,
          results: evalResult,
          stats,
        });
        printEvalSummary(test.name, m, evalResult, stats);
      } catch (e: any) {
        console.error(e);
        results.runs.push({
          id: runId,
          test: test.name,
          matrix: m,
          error: {
            message: e.message,
            stack: e.stack,
          },
        });
      }
      await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
    }
  }

  printResults(results);
}

async function runTest(
  runDir: string,
  config: Config,
  test: TercaTest,
  matrix: ExpandedMatrix,
  runId: number,
) {
  const testRunDir = await setupTestRunDir(runDir, test, runId);
  const logFile = path.join(testRunDir, "run.log");
  const logStream = createWriteStream(logFile);
  const artifactsDir = path.join(testRunDir, "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });

  try {
    const workspaceDir = await setupWorkspace(testRunDir, config);
    await runBeforeActions(workspaceDir, config, test, logStream);
    await runMatrixCommand(workspaceDir, matrix, logStream);
    const stats = await runAgent(
      workspaceDir,
      artifactsDir,
      test,
      matrix,
      logStream,
    );
    const evalResult = await evaluate(workspaceDir, test, logStream);
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
  const testRunDir = path.join(runDir, test.name, runId.toString());
  await fs.mkdir(testRunDir, { recursive: true });
  return testRunDir;
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
) {
  const actions = [...(config.before || []), ...(test.before || [])];
  for (const action of actions) {
    if ("command" in action) {
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
      for (const [src, dest] of Object.entries(action.copy)) {
        await fs.cp(src, path.join(workspaceDir, dest), {
          recursive: true,
        });
      }
    } else if ("files" in action) {
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
) {
  const command = matrix.command as string | undefined;
  if (!command) {
    return;
  }

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
): Promise<AgentRunnerStats | undefined> {
  const agent = matrix.agent as string;
  const Runner = AGENT_RUNNERS[agent];
  if (!Runner) {
    console.log(`Unknown agent: ${agent}, skipping`);
    return;
  }
  const runner = new Runner();

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
      printAgentOutput(progress.output);
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
) {
  const results: any = {};
  const evalCtx: evalActions.EvalActionContext = {
    workspaceDir,
    test,
    logStream,
  };

  for (const evalStep of test.eval || []) {
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
