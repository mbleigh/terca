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
