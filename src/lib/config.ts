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
import { TercaConfigSchema, Config, Environment, Experiment } from "./types.js";

export function loadConfig(file: string = "terca.yaml"): Config {
  const content = fs.readFileSync(file, "utf-8");
  const data = yaml.parse(content);
  return TercaConfigSchema.parse(data);
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
