import { blockTask, completeTask, incrementAttempt } from "../core/task-engine.mjs";
import { evaluateTaskPolicy } from "./sandbox-policy.mjs";

export function runQueuedTasks(state, options = {}) {
  const clock = options.clock ?? new Date();
  const results = [];

  for (const task of [...state.tasks].reverse()) {
    if (task.status !== "queued") continue;

    const policyResult = evaluateTaskPolicy(task, options.policy);

    if (policyResult.decision === "block") {
      blockTask(state, task.id, policyResult.reason, clock);
      results.push({
        taskId: task.id,
        outcome: "blocked",
        reason: policyResult.reason
      });
      continue;
    }

    if (policyResult.decision === "wait_for_approval") {
      task.status = "needs_approval";
      task.updatedAt = clock.toISOString();
      results.push({
        taskId: task.id,
        outcome: "waiting",
        reason: policyResult.reason
      });
      continue;
    }

    incrementAttempt(state, task.id, clock);
    completeTask(
      state,
      task.id,
      {
        mode: "simulated_sandbox",
        summary: simulateResult(task),
        policyReason: policyResult.reason
      },
      clock
    );
    results.push({
      taskId: task.id,
      outcome: "completed",
      reason: policyResult.reason
    });
  }

  return results;
}

function simulateResult(task) {
  if (/summarize|recap|digest/i.test(task.source.text)) {
    return `Created a concise digest for "${task.title}".`;
  }

  if (/draft|email|send|message|notify/i.test(task.source.text)) {
    return `Prepared a draft for "${task.title}" and kept it in approval-safe mode.`;
  }

  if (/check|status|verify/i.test(task.source.text)) {
    return `Checked the requested context for "${task.title}" and recorded the result.`;
  }

  return `Finished simulated sandbox work for "${task.title}".`;
}
