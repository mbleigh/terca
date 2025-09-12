# Gemini Workflow for Terca Development

This document outlines the step-by-step process for implementing the Terca project. Your primary guide is `PLAN.md`.

## Your Development Cycle (Task by Task)

Your goal is to implement the project by completing one task from `PLAN.md` at a time.

### 1. Identify the Next Task

At the beginning of your session, or after completing a previous task, you MUST read these files:

- `PLAN.md`: To find the *very next unchecked item* on the list.
- `SPEC.md`: To ensure you have the full requirements context.

You will work on one checklist item at a time. Announce which task you are about to start.

**Example:**
> "Okay, the next task is to create the directory structure: `src/cli` and `src/lib`."

### 2. Execute the Task

Implement the single task you have identified. Use your available tools to write code, create files, run commands, etc.

### 3. Present Your Work for Approval

After completing the task, you must:

1.  **Show your work.** This could be the command you ran, the file you created, or the code you wrote.
2.  **Explicitly ask for the user's approval** to consider the task complete.

**Example:**
> "I have created the directories using `mkdir -p src/cli src/lib`. Does this look correct?"

### 4. Propose to Update the Plan

**After the user approves your work**, you will then propose to update `PLAN.md` to reflect that the task is complete.

1.  Prepare the `replace` tool call to change `- [ ]` to `- [x]` for the specific task in `PLAN.md`.
2.  Ask for approval to make this change.

**Example:**
> "Great. Now I will mark the task as complete in `PLAN.md`. Please approve."
> 
> (Then show the `replace` tool call).

### 5. Await Approval for Plan Update

Do not modify `PLAN.md` until the user approves the `replace` operation.

### 6. Repeat

Once `PLAN.md` is updated, return to Step 1 and identify the next unchecked task. Continue this cycle until all tasks in all milestones are complete.
