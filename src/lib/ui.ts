import * as c from "./colors.js";
import ora from "ora";
import { stringify } from "yaml";
import { AgentRunnerStats, ExpandedMatrix } from "./types.js";

export function startSpinner(text: string) {
  const spinner = ora(text).start();
  return spinner;
}

export function updateSpinner(spinner: ora.Ora, text: string) {
  spinner.text = text;
}

export function succeedSpinner(spinner: ora.Ora, text: string) {
  spinner.succeed(text);
}

export function failSpinner(spinner: ora.Ora, text: string) {
  spinner.fail(text);
}

export function printHeader(text: string) {
  console.log(
    c.bold(`
=== ${text} ===
`),
  );
}

export function printAgentOutput(output: string) {
  process.stdout.write(output);
}

export function printResults(results: { runs: any[] }) {
  printHeader("Terca Run Summary");

  const runsByEnv = results.runs.reduce(
    (acc: Record<string, any[]>, run: any) => {
      const envName = run.environment || "default";
      if (!acc[envName]) {
        acc[envName] = [];
      }
      acc[envName].push(run);
      return acc;
    },
    {},
  );

  for (const envName in runsByEnv) {
    const runsByExperiment = runsByEnv[envName].reduce(
      (acc: Record<string, any[]>, run: any) => {
        const expName = run.experiment || "default";
        if (!acc[expName]) {
          acc[expName] = [];
        }
        acc[expName].push(run);
        return acc;
      },
      {},
    );

    for (const expName in runsByExperiment) {
      console.log(c.bold(`\n=== ${envName}: ${expName} ===`));

      const runsByTest = runsByExperiment[expName].reduce(
        (acc: Record<string, any[]>, run: any) => {
          const testName = run.test || "default";
          if (!acc[testName]) {
            acc[testName] = [];
          }
          acc[testName].push(run);
          return acc;
        },
        {},
      );

      for (const testName in runsByTest) {
        const runs = runsByTest[testName];
        const passedRuns = runs.filter(
          (run) =>
            run.results &&
            Object.values(run.results).every(
              (result) => ((result as any).score as number) > 0,
            ),
        );
        const passRate = (passedRuns.length / runs.length) * 100;

        const totalDuration = runs.reduce(
          (acc, run) => acc + (run.stats?.durationSeconds || 0),
          0,
        );
        const avgDuration = totalDuration / runs.length;

        const totalInputTokens = runs.reduce(
          (acc, run) => acc + (run.stats?.inputTokens || 0),
          0,
        );
        const avgInputTokens = totalInputTokens / runs.length;

        const totalOutputTokens = runs.reduce(
          (acc, run) => acc + (run.stats?.outputTokens || 0),
          0,
        );
        const avgOutputTokens = totalOutputTokens / runs.length;

        const totalCachedInputTokens = runs.reduce(
          (acc, run) => acc + (run.stats?.cachedInputTokens || 0),
          0,
        );
        const avgCachedInputTokens = totalCachedInputTokens / runs.length;

        let summaryLine = `- ${c.bold(testName)}: `;
        if (passRate > 80) {
          summaryLine += c.green("✅ PASS");
        } else if (passRate > 50) {
          summaryLine += c.yellow("⚠️ WARN");
        } else {
          summaryLine += c.red("❌ FAIL");
        }

        summaryLine += ` (${passedRuns.length}/${runs.length}), `;
        summaryLine += `avg ${avgDuration.toFixed(1)}s, `;
        summaryLine += `token avg: ${(avgInputTokens / 1000).toFixed(
          0,
        )}K in / ${(avgOutputTokens / 1000).toFixed(0)}K out / ${(
          avgCachedInputTokens / 1000
        ).toFixed(0)}K cached`;

        console.log(summaryLine);
      }
    }
  }
}
