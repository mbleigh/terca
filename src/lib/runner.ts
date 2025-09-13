import { expandMatrix, loadConfig } from "./config.js";
import { GeminiAgentRunner } from "./runners/gemini.js";
import { ClaudeAgentRunner } from "./runners/claude.js";
import { CodexAgentRunner } from "./runners/codex.js";
import { OpencodeAgentRunner } from "./runners/opencode.js";
import { AgentRunner, Config, ExpandedMatrix, TercaTest } from "./types.js";
import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { spawn } from "child_process";
import {
  startSpinner,
  updateSpinner,
  succeedSpinner,
  failSpinner,
  printHeader,
  printAgentOutput,
  printResults,
} from "./ui.js";

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

  let runId = 0;
  for (const test of config.tests) {
    for (const m of matrix) {
      runId++;
      const spinner = startSpinner(`Running test: ${test.name} (#${runId})`);
      try {
        const evalResult = await runTest(runDir, config, test, m, runId);
        results.runs.push({
          id: runId,
          test: test.name,
          matrix: m,
          results: evalResult,
        });
        succeedSpinner(spinner, `Test finished: ${test.name} (#${runId})`);
      } catch (e: any) {
        failSpinner(spinner, `Test failed: ${test.name} (#${runId})`);
        console.error(e);
      }
    }
  }

  const resultsFile = path.join(runDir, "results.json");
  await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));

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

  try {
    await setupWorkspace(testRunDir, config);
    await runBeforeActions(testRunDir, config, test, logStream);
    await runAgent(testRunDir, test, matrix, logStream);
    return await evaluate(testRunDir, test, logStream);
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
  while (true) {
    runDir = path.join(
      ".terca",
      "runs",
      `${dateStr}-${i.toString().padStart(3, "0")}`,
    );
    try {
      await fs.mkdir(runDir, { recursive: true });
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

async function setupWorkspace(testRunDir: string, config: Config) {
  if (!config.workspaceDir) {
    return;
  }
  const workspacePath = path.join(testRunDir, "workspace");
  await fs.cp(config.workspaceDir, workspacePath, { recursive: true });
}

async function runBeforeActions(
  testRunDir: string,
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
        cwd: path.join(testRunDir, "workspace"),
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
        await fs.cp(src, path.join(testRunDir, "workspace", dest), {
          recursive: true,
        });
      }
    } else if ("files" in action) {
      for (const [dest, content] of Object.entries(action.files)) {
        await fs.writeFile(path.join(testRunDir, "workspace", dest), content);
      }
    }
  }
}

async function runAgent(
  testRunDir: string,
  test: TercaTest,
  matrix: ExpandedMatrix,
  logStream: NodeJS.WritableStream,
) {
  const agent = matrix.agent as string;
  const Runner = AGENT_RUNNERS[agent];
  if (!Runner) {
    console.log(`Unknown agent: ${agent}, skipping`);
    return;
  }
  const runner = new Runner();

  // TODO: Create temporary files for rules and mcpServers
  const runnerOpts = {
    workspaceDir: path.join(testRunDir, "workspace"),
    prompt: test.prompt,
    rulesFile: matrix.rules as string | undefined,
    mcpServers: matrix.mcpServers as any,
  };

  logStream.write(`
--- Running agent: ${agent} ---
`);
  for await (const progress of runner.run(runnerOpts)) {
    if (progress.output) {
      logStream.write(progress.output);
      printAgentOutput(progress.output);
    }
  }
  logStream.write(`
--- End of agent: ${agent} ---
`);
}

async function evaluate(
  testRunDir: string,
  test: TercaTest,
  logStream: NodeJS.WritableStream,
) {
  const results: any = {};
  for (const evalStep of test.evaluate || []) {
    if (evalStep.commandSuccess) {
      logStream.write(
        `
--- Running evaluation command: ${evalStep.commandSuccess} ---
`,
      );
      const [cmd, ...args] = evalStep.commandSuccess.split(" ");
      const proc = spawn(cmd, args, {
        cwd: path.join(testRunDir, "workspace"),
        stdio: "pipe",
      });

      proc.stdout?.pipe(logStream, { end: false });
      proc.stderr?.pipe(logStream, { end: false });

      const exitCode = await new Promise((resolve) => {
        proc.on("close", resolve);
      });
      results[evalStep.name] = exitCode === 0 ? 1.0 : 0.0;
      logStream.write(
        `
--- End of evaluation command: ${evalStep.commandSuccess} (Exit code: ${exitCode}) ---
`,
      );
    }
  }
  return results;
}
