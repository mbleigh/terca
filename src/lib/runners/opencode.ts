import {
  AgentRunner,
  AgentRunnerOptions,
  AgentRunnerProgress,
} from "../types.js";

export class OpencodeAgentRunner implements AgentRunner {
  async *run(options: AgentRunnerOptions): AsyncIterable<AgentRunnerProgress> {
    throw new Error("Not implemented");
  }
}
