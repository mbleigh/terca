import chalk from "chalk";
import ora from "ora";
import logUpdate from "log-update";
import Table from "cli-table3";

const outputLines: string[] = [];

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
    chalk.bold(`
=== ${text} ===
`),
  );
}

export function printAgentOutput(output: string) {
  outputLines.push(...output.split("\n"));
  if (outputLines.length > 10) {
    outputLines.splice(0, outputLines.length - 10);
  }
  logUpdate(outputLines.join("\n"));
}

export function printResults(results: { runs: any[] }) {
  logUpdate.clear();
  printHeader("Results");

  const table = new Table({
    head: ["Run #", "Test", "Matrix", "Score"],
    colWidths: [10, 20, 40, 10],
  });

  for (const run of results.runs) {
    const matrixId = Object.entries(run.matrix)
      .map(([k, v]) => {
        if (typeof v === "object" && v !== null) {
          return `${k}=${JSON.stringify(v)}`;
        }
        return `${k}=${v}`;
      })
      .join(", ");

    const evalScores = Object.values(run.results);
    const scoreSum = evalScores.reduce(
      (acc: number, val: any) => acc + val,
      0,
    ) as number;
    const avgScore = evalScores.length > 0 ? scoreSum / evalScores.length : 0;

    const color = avgScore > 0.7 ? "green" : avgScore > 0.5 ? "yellow" : "red";
    table.push([run.id, run.test, matrixId, chalk[color](avgScore.toFixed(2))]);
  }

  console.log(table.toString());
}
