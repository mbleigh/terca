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
  console.log(chalk.bold(`
=== ${text} ===
`));
}

export function printAgentOutput(output: string) {
  outputLines.push(...output.split("\n"));
  if (outputLines.length > 10) {
    outputLines.splice(0, outputLines.length - 10);
  }
  logUpdate(outputLines.join("\n"));
}

export function printResults(results: any) {
  logUpdate.clear();
  printHeader("Results");

  const table = new Table({
    head: ["Test", "Matrix", "Result"],
    colWidths: [20, 40, 10],
  });

  for (const testName in results) {
    for (const matrixId in results[testName]) {
      const result = results[testName][matrixId];
      const score = Object.values(result).reduce(
        (acc: number, val: any) => acc + val,
        0
      ) as number;
      const color = score > 0.7 ? "green" : score > 0.5 ? "yellow" : "red";
      table.push([
        testName,
        matrixId,
        chalk[color](score.toFixed(2)),
      ]);
    }
  }

  console.log(table.toString());
}
