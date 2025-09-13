import fs from "fs";
import yaml from "yaml";
import { TercaConfigSchema, TercaConfig, MatrixEntry } from "./types.js";

export function loadConfig(file: string): TercaConfig {
  const content = fs.readFileSync(file, "utf-8");
  const data = yaml.parse(content);
  return TercaConfigSchema.parse(data);
}

export function expandMatrix(matrix: MatrixEntry[]): Record<string, any>[] {
  let results: Record<string, any>[] = [{}];

  for (const entry of matrix) {
    const newResults: Record<string, any>[] = [];
    const combinations = expandEntry(entry);
    for (const result of results) {
      for (const combination of combinations) {
        newResults.push({ ...result, ...combination });
      }
    }
    results = newResults;
  }

  return results;
}

function expandEntry(entry: MatrixEntry): Record<string, any>[] {
  const keys = Object.keys(entry).filter(k => isNaN(parseInt(k))) as (keyof MatrixEntry)[];
  const arrayKeys = keys.filter((key) => Array.isArray(entry[key]));

  if (arrayKeys.length === 0) {
    return [entry];
  }

  const longestArrayLength = Math.max(
    ...arrayKeys.map((key) => (entry[key] as any[]).length)
  );

  const results: Record<string, any>[] = [];
  for (let i = 0; i < longestArrayLength; i++) {
    const combination: Record<string, any> = {};
    for (const key of keys) {
      if (arrayKeys.includes(key)) {
        const array = entry[key] as any[];
        if (i < array.length) {
          combination[key] = array[i];
        }
      } else if (entry[key] !== undefined) {
        combination[key] = entry[key];
      }
    }
    results.push(combination);
  }

  return results;
}
