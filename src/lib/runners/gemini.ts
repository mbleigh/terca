import { spawn } from "child_process";
import {
  AgentRunner,
  AgentRunnerOptions,
  AgentRunnerProgress,
} from "../types.js";
import fs from "fs/promises";
import path from "path";

export class GeminiAgentRunner implements AgentRunner {
  async *run(options: AgentRunnerOptions): AsyncIterable<AgentRunnerProgress> {
    const args = ["-p", options.prompt, "--yolo"];

    if (options.rulesFile) {
      args.push("--rules", options.rulesFile);
    }

    if (options.mcpServers) {
      const mcpConfigFile = path.join(options.workspaceDir, ".terca-mcp.json");
      await fs.writeFile(
        mcpConfigFile,
        JSON.stringify(options.mcpServers, null, 2),
      );
      args.push("--mcp-config", mcpConfigFile);
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

    yield { done: true, exitCode };
  }
}
