import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGrandState, getMetrics, seedDemoTasks } from "../core/task-engine.mjs";

export async function loadState(filePath, options = {}) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;

    const state = createGrandState(options.clock);
    if (options.seed !== false) seedDemoTasks(state, options.clock);
    await saveState(filePath, state);
    return state;
  }
}

export async function saveState(filePath, state) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

export function buildTaskReport(task, state) {
  const metrics = getMetrics(state);
  const riskReasons = task.risk.reasons.map((reason) => `- ${reason}`).join("\n");

  return `# ${task.id}

## Summary

${task.title}

## Status

- Status: ${task.status}
- Channel: ${task.source.channel}
- From: ${task.source.from}
- Received: ${task.source.receivedAt}
- Due: ${task.due || "none"}

## Risk

- Level: ${task.risk.level}
- Approval required: ${task.approval.required ? "yes" : "no"}
- Allowed mode: ${task.risk.allowedMode}

${riskReasons || "- none"}

## Approval

- Approved by: ${task.approval.approvedBy || "none"}
- Approved at: ${task.approval.approvedAt || "none"}
- Rejected by: ${task.approval.rejectedBy || "none"}
- Rejected at: ${task.approval.rejectedAt || "none"}

## Source Message

${task.source.text}

## Runner

- Attempts: ${task.runner.attempts}
- Last run: ${task.runner.lastRunAt || "never"}
- Result: ${task.runner.result ? task.runner.result.summary : "none"}

## Queue Metrics At Report Time

- Total: ${metrics.total}
- Queued: ${metrics.queued}
- Needs approval: ${metrics.needsApproval}
- Completed: ${metrics.completed}
- Rejected: ${metrics.rejected}
- Blocked: ${metrics.blocked}
`;
}
