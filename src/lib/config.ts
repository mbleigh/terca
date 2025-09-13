import fs from "fs";
import yaml from "yaml";
import { TercaConfigSchema, Config, MatrixEntry } from "./types.js";

export function loadConfig(file: string = "terca.yaml"): Config {
  const content = fs.readFileSync(file, "utf-8");
  const data = yaml.parse(content);
  return TercaConfigSchema.parse(data);
}

export function expandMatrix(matrix: MatrixEntry[]): Record<string, any>[] {
  if (!matrix || matrix.length === 0) {
    return [{}];
  }

  let results: Record<string, any>[] = [{}];

  for (const entry of matrix) {
    const newResults: Record<string, any>[] = [];
    const keys = Object.keys(entry) as (keyof MatrixEntry)[];

    // Get all possible values for each key in the current entry
    const valueSets: Record<string, any[]> = {};
    for (const key of keys) {
      const value = entry[key];
      if (Array.isArray(value)) {
        valueSets[key] = value;
      } else {
        valueSets[key] = [value];
      }
    }

    // Generate Cartesian product of the value sets
    const product = cartesianProduct(valueSets);

    for (const result of results) {
      for (const p of product) {
        newResults.push({ ...result, ...p });
      }
    }
    results = newResults;
  }

  return results;
}

function cartesianProduct(sets: Record<string, any[]>) {
  const keys = Object.keys(sets);
  if (keys.length === 0) {
    return [{}];
  }

  const results: Record<string, any>[] = [];
  const firstKey = keys[0];
  const firstSet = sets[firstKey];
  const remainingSets = { ...sets };
  delete remainingSets[firstKey];

  const remainingProduct = cartesianProduct(remainingSets);

  for (const value of firstSet) {
    for (const p of remainingProduct) {
      const newProduct = { ...p };
      if (value !== undefined) {
        newProduct[firstKey] = value;
      }
      results.push(newProduct);
    }
  }

  return results;
}
