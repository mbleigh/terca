import { spawn } from "child_process";
import {
  AgentRunner,
  AgentRunnerOptions,
  AgentRunnerProgress,
  AgentRunnerStats,
} from "../types.js";
import fs from "fs/promises";
import path from "path";

export class GeminiAgentRunner implements AgentRunner {
  async *run(options: AgentRunnerOptions): AsyncIterable<AgentRunnerProgress> {
    const startTime = Date.now();
    const geminiDir = path.join(options.artifactsDir, ".gemini");
    const settingsFile = path.join(geminiDir, "settings.json");
    const summaryFile = path.join(geminiDir, "summary.json");
    const summaryFileRelative = path.relative(
      options.workspaceDir,
      summaryFile,
    );
    const args = [
      "-p",
      options.prompt,
      "--yolo",
      "--session-summary",
      summaryFileRelative,
    ];

    try {
      await fs.mkdir(geminiDir, { recursive: true });

      const settings: any = {};

      if (options.rulesFile) {
        const rulesDest = path.join(
          options.workspaceDir,
          path.basename(options.rulesFile),
        );
        await fs.copyFile(options.rulesFile, rulesDest);
        settings.context = { fileName: path.basename(options.rulesFile) };
      }

      if (options.mcpServers) {
        settings.mcpServers = options.mcpServers;
      }

      if (Object.keys(settings).length > 0) {
        await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
      }

      const child = spawn("gemini", args, {
        cwd: options.workspaceDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Stream stdout
      if (child.stdout) {
        for await (const chunk of child.stdout) {
          yield { output: chunk.toString() };
        }
      }

      // Stream stderr
      if (child.stderr) {
        for await (const chunk of child.stderr) {
          yield { output: chunk.toString() };
        }
      }

      const exitCode = await new Promise<number>((resolve) => {
        child.on("close", resolve);
      });

      let stats: AgentRunnerStats | undefined;
      try {
        const summaryJson = await fs.readFile(summaryFile, "utf-8");
        const summary = JSON.parse(summaryJson);
        const modelMetrics = summary.sessionMetrics.models[""];
        if (modelMetrics) {
          stats = {
            requests: modelMetrics.api.totalRequests,
            inputTokens: modelMetrics.tokens.prompt,
            cachedInputTokens: modelMetrics.tokens.cached,
            outputTokens: modelMetrics.tokens.candidates,
            durationSeconds: (Date.now() - startTime) / 1000,
          };
        }
      } catch (e) {
        // ignore
      }

      yield { done: true, exitCode, stats };
    } finally {
      await fs.rm(geminiDir, { recursive: true, force: true });
    }
  }
}
