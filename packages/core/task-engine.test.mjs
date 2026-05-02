import assert from "node:assert/strict";
import test from "node:test";
import {
  approveTask,
  createGrandState,
  createTaskFromMessage,
  getMetrics
} from "./task-engine.mjs";
import { handleIncomingChat, parseGrandCommand } from "../connectors/chat-simulator.mjs";
import { runQueuedTasks } from "../sandbox/safe-runner.mjs";

test("safe messages become queued tasks", () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const task = createTaskFromMessage(state, {
    channel: "slack",
    from: "operator",
    text: "Summarize customer feedback for today."
  });

  assert.equal(task.status, "queued");
  assert.equal(task.risk.level, "safe");
  assert.equal(getMetrics(state).queued, 1);
});

test("risky messages require approval before execution", () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const task = createTaskFromMessage(state, {
    channel: "telegram",
    from: "ops",
    text: "Refund invoice INV-1042 and send the customer an update."
  });

  assert.equal(task.status, "needs_approval");
  assert.equal(task.approval.required, true);

  approveTask(state, task.id, "owner", new Date("2026-05-02T12:05:00Z"));
  assert.equal(task.status, "queued");

  const results = runQueuedTasks(state, { clock: new Date("2026-05-02T12:06:00Z") });
  assert.equal(results[0].outcome, "completed");
  assert.equal(task.status, "completed");
});

test("chat commands parse compact Grand actions", () => {
  assert.deepEqual(parseGrandCommand("grand status"), {
    name: "status",
    taskId: null
  });
  assert.deepEqual(parseGrandCommand("/grand approve task_1"), {
    name: "approve",
    taskId: "task_1"
  });
});

test("connector creates tasks for normal messages", () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const result = handleIncomingChat(state, {
    channel: "discord",
    from: "founder",
    text: "Check the open onboarding tasks and draft a reminder."
  });

  assert.equal(result.kind, "task_created");
  assert.equal(state.tasks.length, 1);
});
