/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from "fs";
import yaml from "yaml";
import path from "path";
import { TercaConfigSchema, Config, TercaEvalConfigSchema } from "./types.js";

export async function loadConfig(root: string = process.cwd()): Promise<Config> {
  const configFile = path.join(root, "terca.yaml");
  let configData: any = {};

  try {
    const content = fs.readFileSync(configFile, "utf-8");
    configData = yaml.parse(content) || {};
    if (!configData.name) {
      configData.name = path.basename(root);
    }
  } catch (e: any) {
    if (e.code !== "ENOENT") {
      throw e;
    }
    // It's okay if terca.yaml doesn't exist, we might just have eval.terca.yaml files
    configData = { name: path.basename(root) };
  }

  // Parse the main config first to get base values
  // We allow partial parsing here because we might add evals later
  const config = TercaConfigSchema.parse(configData);

  // Scan for eval.terca.yaml files
  const files = await findEvalConfigs(root);

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const data = yaml.parse(content);
    const evalConfig = TercaEvalConfigSchema.parse(data);

    const evalDir = path.dirname(file);
    const evalName = evalConfig.name || path.basename(evalDir);

    config.evals.push({
      ...evalConfig,
      name: evalName,
      dir: evalDir,
    });
  }

  return config;
}

async function findEvalConfigs(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }
      results.push(...(await findEvalConfigs(fullPath)));
    } else if (entry.name === "eval.terca.yaml") {
      results.push(fullPath);
    }
  }
  return results;
}

export function expandEnvironmentsAndExperiments(
  config: Config,
): Record<string, any>[] {
  const environments = config.environments || [];
  if (environments.length === 0) {
    environments.push({ name: "default" });
  }
  const experiments = config.experiments || [];
  if (experiments.length === 0) {
    experiments.push({ name: "default" });
  }

  let results: Record<string, any>[] = [];

  for (const environment of environments) {
    for (const experiment of experiments) {
      const name =
        experiment.name !== "default"
          ? experiment.name
          : environment.name !== "default"
            ? environment.name
            : "default";
      results.push({
        ...environment,
        ...experiment,
        name,
        environment: environment.name,
        experiment: experiment.name,
      });
    }
  }

  return results;
}
