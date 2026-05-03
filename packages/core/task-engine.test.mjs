import assert from "node:assert/strict";
import test from "node:test";
import {
  approveTask,
  createGrandState,
  createTaskFromMessage,
  getMetrics
} from "./task-engine.mjs";
import { handleIncomingChat, handleIncomingChatAsync, parseGrandCommand } from "../connectors/chat-simulator.mjs";
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
  assert.deepEqual(parseGrandCommand("grand github sync Evode-Manirahari/Grand-"), {
    name: "github_sync",
    repo: "Evode-Manirahari/Grand-"
  });
  assert.deepEqual(parseGrandCommand("grand github status"), {
    name: "github_status",
    taskId: null
  });
  assert.deepEqual(parseGrandCommand("grand github drafts"), {
    name: "github_drafts",
    taskId: null
  });
  assert.deepEqual(parseGrandCommand("grand github publish task_1"), {
    name: "github_publish",
    taskId: "task_1"
  });
  assert.deepEqual(parseGrandCommand("grand github issue Evode-Manirahari/Grand- Add billing dashboard"), {
    name: "github_issue",
    repo: "Evode-Manirahari/Grand-",
    title: "Add billing dashboard"
  });
  assert.deepEqual(parseGrandCommand("grand issue Add onboarding checklist"), {
    name: "github_issue",
    repo: null,
    title: "Add onboarding checklist"
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

test("connector syncs GitHub issues from chat", async () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const synced = await handleIncomingChatAsync(
    state,
    {
      channel: "telegram",
      from: "owner",
      text: "grand github sync Evode-Manirahari/Grand-"
    },
    {
      github: {
        fetchIssues: async () => [
          {
            number: 12,
            title: "Create billing dashboard",
            html_url: "https://github.com/Evode-Manirahari/Grand-/issues/12",
            user: { login: "founder" }
          }
        ]
      },
      clock: new Date("2026-05-02T12:01:00Z")
    }
  );

  assert.equal(synced.kind, "github_sync");
  assert.match(synced.reply, /1 open issue scanned/);
  assert.match(synced.reply, /1 new task/);
  assert.equal(state.tasks[0].source.channel, "github");
});

test("connector reports GitHub config status", async () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const status = await handleIncomingChatAsync(
    state,
    {
      channel: "telegram",
      from: "owner",
      text: "grand github status"
    },
    {
      github: {
        repo: "Evode-Manirahari/Grand-",
        token: "",
        limit: 10
      }
    }
  );

  assert.equal(status.kind, "github_status");
  assert.match(status.reply, /GitHub config/);
  assert.match(status.reply, /draft-only/);
});

test("connector creates GitHub issues from chat", async () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const created = await handleIncomingChatAsync(
    state,
    {
      channel: "telegram",
      from: "owner",
      text: "grand github issue Add onboarding checklist"
    },
    {
      github: {
        repo: "Evode-Manirahari/Grand-",
        createIssue: async (repo, input) => ({
          number: 13,
          title: input.title,
          body: input.body,
          html_url: `https://github.com/${repo}/issues/13`,
          user: { login: "owner" }
        })
      },
      clock: new Date("2026-05-02T12:01:00Z")
    }
  );

  assert.equal(created.kind, "github_issue_created");
  assert.match(created.reply, /GitHub issue created/);
  assert.match(created.reply, /issues\/13/);
  assert.equal(state.tasks[0].source.channel, "github");
});

test("connector saves GitHub issue drafts when token is missing", async () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const draft = await handleIncomingChatAsync(
    state,
    {
      channel: "telegram",
      from: "owner",
      text: "grand github issue Add auth setup screen"
    },
    {
      github: {
        repo: "Evode-Manirahari/Grand-",
        token: ""
      },
      clock: new Date("2026-05-02T12:02:00Z")
    }
  );

  assert.equal(draft.kind, "github_issue_draft");
  assert.match(draft.reply, /draft saved/);
  assert.match(draft.reply, /GITHUB_TOKEN or GH_TOKEN/);
  assert.match(draft.reply, new RegExp(`grand github publish ${state.tasks[0].id}`));
  assert.equal(state.tasks[0].source.channel, "github");
});

test("connector lists GitHub issue drafts from chat", async () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const draft = await handleIncomingChatAsync(
    state,
    {
      channel: "telegram",
      from: "owner",
      text: "grand github issue Add draft list"
    },
    {
      github: {
        repo: "Evode-Manirahari/Grand-",
        token: ""
      },
      clock: new Date("2026-05-02T12:02:00Z")
    }
  );
  const listed = await handleIncomingChatAsync(
    state,
    {
      channel: "telegram",
      from: "owner",
      text: "grand github drafts"
    },
    {
      github: {
        repo: "Evode-Manirahari/Grand-",
        token: ""
      }
    }
  );

  assert.equal(listed.kind, "github_drafts");
  assert.match(listed.reply, /GitHub issue drafts/);
  assert.match(listed.reply, new RegExp(draft.result.task.id));
  assert.match(listed.reply, /grand github publish/);
});

test("connector publishes GitHub issue drafts from chat", async () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const draft = await handleIncomingChatAsync(
    state,
    {
      channel: "telegram",
      from: "owner",
      text: "grand github issue Add publish flow"
    },
    {
      github: {
        repo: "Evode-Manirahari/Grand-",
        token: ""
      },
      clock: new Date("2026-05-02T12:02:00Z")
    }
  );
  const published = await handleIncomingChatAsync(
    state,
    {
      channel: "telegram",
      from: "owner",
      text: `grand github publish ${draft.result.task.id}`
    },
    {
      github: {
        createIssue: async (repo, input) => ({
          number: 14,
          title: input.title,
          body: input.body,
          html_url: `https://github.com/${repo}/issues/14`,
          user: { login: "owner" }
        })
      },
      clock: new Date("2026-05-02T12:03:00Z")
    }
  );

  assert.equal(published.kind, "github_issue_published");
  assert.match(published.reply, /GitHub draft published/);
  assert.match(published.reply, /issues\/14/);
  assert.equal(draft.result.task.status, "completed");
  assert.equal(draft.result.task.source.url, "https://github.com/Evode-Manirahari/Grand-/issues/14");
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
