import { spawn } from "child_process";
import { AgentRunner, AgentRunnerOptions, AgentRunnerProgress } from "../types";

export class GeminiAgentRunner implements AgentRunner {
  async *run(options: AgentRunnerOptions): AsyncIterable<AgentRunnerProgress> {
    const args = ["-p", options.prompt, "--yolo"];

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
