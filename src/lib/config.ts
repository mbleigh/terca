import fs from "fs";
import yaml from "yaml";
import { TercaConfigSchema, TercaConfig, MatrixEntry } from "./types";

export function loadConfig(file: string): TercaConfig {
  const content = fs.readFileSync(file, "utf-8");
  const data = yaml.parse(content);
  return TercaConfigSchema.parse(data);
}

export function expandMatrix(matrix: MatrixEntry[]): Record<string, any>[] {
  let results: Record<string, any>[] = [{}];

  for (const entry of matrix) {
    const newResults: Record<string, any>[] = [];
    const entryKeys = Object.keys(entry) as (keyof MatrixEntry)[];

    for (const result of results) {
      const combinations = cartesianProduct(entry, entryKeys);
      for (const combination of combinations) {
        newResults.push({ ...result, ...combination });
      }
    }
    results = newResults;
  }

  return results;
}

function cartesianProduct(
  entry: MatrixEntry,
  keys: (keyof MatrixEntry)[]
): Record<string, any>[] {
  let results: Record<string, any>[] = [{}];

  for (const key of keys) {
    const newResults: Record<string, any>[] = [];
    const values = Array.isArray(entry[key])
      ? (entry[key] as any[])
      : [entry[key]];

    for (const result of results) {
      for (const value of values) {
        newResults.push({ ...result, [key]: value });
      }
    }
    results = newResults;
  }

  return results;
}
