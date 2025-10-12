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

  let overallPassed = 0;
  let overallNeutral = 0;
  let overallFailed = 0;

  const runsByExperiment = results.runs.reduce(
    (acc: Record<string, any[]>, run: any) => {
      const experimentName = run.experiment || "default";
      if (!acc[experimentName]) {
        acc[experimentName] = [];
      }
      acc[experimentName].push(run);
      return acc;
    },
    {} as Record<string, any[]>,
  );

  for (const experimentName in runsByExperiment) {
    console.log(
      c.bold(`
=== Experiment: ${experimentName} ===`),
    );

    const runsByEnvironment = runsByExperiment[experimentName].reduce(
      (acc, run) => {
        const environmentName = run.environment || "default";
        if (!acc[environmentName]) {
          acc[environmentName] = [];
        }
        acc[environmentName].push(run);
        return acc;
      },
      {} as Record<string, any[]>,
    );

    for (const environmentName in runsByEnvironment) {
      console.log(
        c.bold(`
  --- Environment: ${environmentName} ---`),
      );

      const tests = runsByEnvironment[environmentName];

      for (const test of tests) {
        let passed = 0;
        let neutral = 0;
        let failed = 0;

        for (const score of Object.values(test.results || {})) {
          const numericScore = score as number;
          if (numericScore === 1.0) passed++;
          else if (numericScore > 0.0 && numericScore < 1.0) neutral++;
          else failed++;
        }

        overallPassed += passed;
        overallNeutral += neutral;
        overallFailed += failed;

        const summaryParts = [];
        if (passed > 0) summaryParts.push(c.green(`${passed} passed`));
        if (neutral > 0) summaryParts.push(c.yellow(`${neutral} neutral`));
        if (failed > 0) summaryParts.push(c.red(`${failed} failed`));

        if (test.stats?.timedOut) {
          summaryParts.push(c.red("(timed out)"));
        }

        console.log(`
    --- ${test.test} (${summaryParts.join(", ")}) ---`);

        if (test.stats) {
          console.log(
            c.gray(
              `      (duration: ${test.stats.durationSeconds.toFixed(
                2,
              )}s, tokens: ${test.stats.inputTokens} in / ${
                test.stats.outputTokens
              } out)`,
            ),
          );
        }

        for (const [evalName, score] of Object.entries(test.results || {})) {
          const numericScore = score as number;
          if (numericScore === 1.0) {
            console.log(`      ${c.green("✔︎")} ${evalName}`);
          } else if (numericScore > 0.0 && numericScore < 1.0) {
            console.log(`      ${c.yellow("~")} ${evalName} (${numericScore})`);
          } else {
            console.log(`      ${c.red("✖︎")} ${evalName}`);
          }
        }
      }
    }
  }

  const overallSummaryParts = [];
  if (overallPassed > 0)
    overallSummaryParts.push(c.green(`${overallPassed} passed`));
  if (overallNeutral > 0)
    overallSummaryParts.push(c.yellow(`${overallNeutral} neutral`));
  if (overallFailed > 0)
    overallSummaryParts.push(c.red(`${overallFailed} failed`));

  console.log(
    c.bold(`
OVERALL: ${overallSummaryParts.join(", ")}`),
  );
}
