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
  assert.deepEqual(parseGrandCommand("grand list approvals"), {
    name: "list",
    filter: "needs_approval",
    taskId: null
  });
  assert.deepEqual(parseGrandCommand("grand report"), {
    name: "report",
    taskId: null
  });
  assert.deepEqual(parseGrandCommand("grand show task_1"), {
    name: "task",
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

test("connector lists approval tasks with actionable commands", () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const created = handleIncomingChat(state, {
    channel: "telegram",
    from: "owner",
    text: "Refund customer INV-1042 and send them an update."
  });
  const listed = handleIncomingChat(state, {
    channel: "telegram",
    from: "owner",
    text: "grand list approvals"
  });

  assert.equal(created.kind, "task_created");
  assert.match(created.reply, new RegExp(`Approve: grand approve ${created.task.id}`));
  assert.equal(listed.kind, "task_list");
  assert.match(listed.reply, new RegExp(created.task.id));
  assert.match(listed.reply, /Approve: grand approve/);
});

test("connector runs queued tasks from chat", () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const created = handleIncomingChat(state, {
    channel: "telegram",
    from: "owner",
    text: "Summarize customer feedback for today."
  });
  const run = handleIncomingChat(
    state,
    {
      channel: "telegram",
      from: "owner",
      text: "grand run"
    },
    { clock: new Date("2026-05-02T12:05:00Z") }
  );

  assert.equal(created.task.status, "completed");
  assert.equal(run.kind, "tasks_run");
  assert.match(run.reply, /1 completed/);
});

test("connector reports current work and next actions", () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const approval = handleIncomingChat(state, {
    channel: "telegram",
    from: "owner",
    text: "Refund customer INV-1042 and send them an update."
  });
  const report = handleIncomingChat(state, {
    channel: "telegram",
    from: "owner",
    text: "grand report"
  });
  const next = handleIncomingChat(state, {
    channel: "telegram",
    from: "owner",
    text: "grand next"
  });

  assert.equal(report.kind, "report");
  assert.match(report.reply, /Grand report/);
  assert.match(report.reply, new RegExp(approval.task.id));
  assert.equal(next.kind, "next_actions");
  assert.match(next.reply, new RegExp(`Approve: grand approve ${approval.task.id}`));
});

test("connector shows task detail from chat", () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const created = handleIncomingChat(state, {
    channel: "telegram",
    from: "owner",
    text: "Summarize customer feedback for today."
  });
  const detail = handleIncomingChat(state, {
    channel: "telegram",
    from: "owner",
    text: `grand task ${created.task.id}`
  });

  assert.equal(detail.kind, "task_detail");
  assert.match(detail.reply, new RegExp(created.task.id));
  assert.match(detail.reply, /Status: queued/);
});

test("connector returns friendly task command errors", () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const missingId = handleIncomingChat(state, {
    channel: "telegram",
    from: "owner",
    text: "grand approve"
  });
  const unknown = handleIncomingChat(state, {
    channel: "telegram",
    from: "owner",
    text: "grand nope"
  });

  assert.equal(missingId.kind, "command_error");
  assert.match(missingId.reply, /grand approve <task-id>/);
  assert.equal(unknown.kind, "unknown_command");
  assert.match(unknown.reply, /grand help/);
});
