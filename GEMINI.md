## Task Start

- When given a new task, first propose changes to `SPEC.md` to represent what the final state should be after the task is complete. Changes that are purely cosmetic but don't affect behavior or anything enumerated in the spec don't need spec changes.

## Task Completion

Always perform these actions after a task is complete:

- Run `pnpm test` to ensure the code compiles and tests are passing.
- Update `README.md` to reflect any user documentation that needs to change as a result of your work.
- Update `SPEC.md` to reflect the final state of the task including any changes that were proposed by the user mid-stream.
- Propose a commit message to the user but DO NOT commit unless the user approves.
