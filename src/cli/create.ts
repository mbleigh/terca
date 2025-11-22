import * as p from "@clack/prompts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createProject() {
  p.intro(`terca create`);

  const project = await p.group(
    {
      name: () =>
        p.text({
          message: "What is the name of your project?",
          placeholder: "my-terca-project",
          validate: (value) => {
            if (!value) return "Project name is required";
            if (fs.existsSync(value)) return "Directory already exists";
          },
        }),
      agents: () =>
        p.multiselect({
          message: "Which agents would you like to set up?",
          options: [
            { value: "gemini-cli", label: "Gemini CLI" },
            { value: "claude-code", label: "Claude Code" },
          ],
          required: true,
        }),
      firstEval: () =>
        p.text({
          message: "Name of your first eval (optional)",
          placeholder: "001-first-eval",
        }),
    },
    {
      onCancel: () => {
        p.cancel("Operation cancelled.");
        process.exit(0);
      },
    }
  );

  const projectDir = path.resolve(process.cwd(), project.name);
  const evalName = project.firstEval || "001-first-eval";
  const evalDir = path.join(projectDir, evalName);

  fs.mkdirSync(projectDir);
  fs.mkdirSync(path.join(projectDir, "_base"));
  fs.mkdirSync(evalDir);

  const tercaYaml = `name: ${project.name}
environments:
${project.agents
      .map(
        (agent) => `  - name: ${agent}
    agent: ${agent}`
      )
      .join("\n")}

# description: A description of your test suite.
# preamble: |
#   You are a helpful assistant.
# postamble: |
#   Always format your output as JSON.
# repetitions: 1
# concurrency: 4
# timeoutSeconds: 300

# before:
#   - command: npm install
#   - copy:
#       template.js: src/template.js
#   - files:
#       config.json: |
#         {
#           "api_key": "YOUR_API_KEY"
#         }
`;

  const evalTercaYaml = `prompt: "Hello, world!"
# name: ${evalName}
# description: Description of this eval
# repetitions: 1
# timeoutSeconds: 300
# before:
#   - command: npm install
# tests:
#   - name: check_output_file
#     fileExists: output.txt
#   - name: verify_script_runs
#     commandSuccess: node script.js
`;

  fs.writeFileSync(path.join(projectDir, "terca.yaml"), tercaYaml);
  fs.writeFileSync(path.join(evalDir, "eval.terca.yaml"), evalTercaYaml);
  fs.writeFileSync(path.join(projectDir, "_base", "README.md"), "# Base Directory\n\nPlace base files here.");

  p.note(`Project created in ${projectDir}`, "Success");
  p.outro(`Run 'cd ${project.name} && terca run' to get started.`);
}

export async function createEval(name?: string) {
  let currentDir = process.cwd();
  let projectDir: string | null = null;

  while (currentDir !== path.parse(currentDir).root) {
    if (fs.existsSync(path.join(currentDir, "terca.yaml"))) {
      projectDir = currentDir;
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  if (!projectDir) {
    p.log.error("Could not find terca.yaml in current or parent directories.");
    process.exit(1);
  }

  p.intro(`terca create-eval`);

  const evalName =
    name ||
    (await p.text({
      message: "What is the name of your eval?",
      placeholder: "002-new-eval",
      validate: (value) => {
        if (!value) return "Eval name is required";
        if (fs.existsSync(path.join(projectDir!, value)))
          return "Directory already exists";
      },
    }));

  if (p.isCancel(evalName)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const evalDir = path.join(projectDir, evalName as string);
  fs.mkdirSync(evalDir);

  const evalTercaYaml = `prompt: "Hello, world!"
# name: ${evalName}
# description: Description of this eval
# repetitions: 1
# timeoutSeconds: 300
# before:
#   - command: npm install
# tests:
#   - name: check_output_file
#     fileExists: output.txt
#   - name: verify_script_runs
#     commandSuccess: node script.js
`;

  fs.writeFileSync(path.join(evalDir, "eval.terca.yaml"), evalTercaYaml);

  p.note(`Eval created in ${evalDir}`, "Success");
  p.outro(`Run 'terca run' to run this eval.`);
}
