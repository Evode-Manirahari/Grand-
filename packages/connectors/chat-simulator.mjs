import {
  approveTask,
  completeTask,
  createTaskFromMessage,
  getMetrics,
  rejectTask,
  requireTask
} from "../core/task-engine.mjs";
import { syncGitHubIssuesToTasks } from "./github-issues.mjs";
import { runQueuedTasks } from "../sandbox/safe-runner.mjs";

export function handleIncomingChat(state, incoming, options = {}) {
  const command = parseGrandCommand(incoming.text);
  const actor = incoming.from || "operator";

  if (!command) {
    const task = createTaskFromMessage(state, incoming, options);

    return {
      kind: "task_created",
      task,
      reply: formatTaskReply(task)
    };
  }

  try {
    return handleGrandCommand(state, command, actor, options);
  } catch (error) {
    return {
      kind: "command_error",
      reply: error.message
    };
  }
}

export async function handleIncomingChatAsync(state, incoming, options = {}) {
  const command = parseGrandCommand(incoming.text);
  const actor = incoming.from || "operator";

  if (!command) {
    const task = createTaskFromMessage(state, incoming, options);

    return {
      kind: "task_created",
      task,
      reply: formatTaskReply(task)
    };
  }

  try {
    return await handleGrandCommandAsync(state, command, actor, options);
  } catch (error) {
    return {
      kind: "command_error",
      reply: error.message
    };
  }
}

function handleGrandCommand(state, command, actor, options) {
  if (command.name === "help") {
    return {
      kind: "help",
      reply: formatHelpReply()
    };
  }

  if (command.name === "status") {
    const metrics = getMetrics(state);

    return {
      kind: "status",
      metrics,
      reply: formatStatusReply(metrics)
    };
  }

  if (command.name === "report") {
    const metrics = getMetrics(state);

    return {
      kind: "report",
      metrics,
      reply: formatReportReply(state, metrics)
    };
  }

  if (command.name === "next") {
    return {
      kind: "next_actions",
      reply: formatNextReply(state)
    };
  }

  if (command.name === "task") {
    requireCommandTaskId(command, "task");
    const task = requireTask(state, command.taskId);

    return {
      kind: "task_detail",
      task,
      reply: formatTaskDetailReply(task)
    };
  }

  if (command.name === "github_sync") {
    throw new Error("GitHub sync is available through the running Grand server. Use: grand github sync owner/repo");
  }

  if (command.name === "list") {
    const tasks = selectTasksForList(state.tasks, command.filter);

    return {
      kind: "task_list",
      tasks,
      reply: formatTaskListReply(tasks, command.filter)
    };
  }

  if (command.name === "run") {
    const results = runQueuedTasks(state, options);

    return {
      kind: "tasks_run",
      results,
      metrics: getMetrics(state),
      reply: formatRunReply(results, state)
    };
  }

  if (command.name === "approve") {
    requireCommandTaskId(command, "approve");
    const task = approveTask(state, command.taskId, actor, options.clock);

    return {
      kind: "task_approved",
      task,
      reply: `${task.id} approved and queued: ${task.title}\nRun it with: grand run`
    };
  }

  if (command.name === "reject") {
    requireCommandTaskId(command, "reject");
    const task = rejectTask(state, command.taskId, actor, options.clock);

    return {
      kind: "task_rejected",
      task,
      reply: `${task.id} rejected: ${task.title}`
    };
  }

  if (command.name === "done") {
    requireCommandTaskId(command, "done");
    const task = completeTask(
      state,
      command.taskId,
      {
        summary: `${actor} marked ${command.taskId} done.`,
        mode: "manual"
      },
      options.clock
    );
    return {
      kind: "task_completed",
      task,
      reply: `${task.id} marked complete: ${task.title}`
    };
  }

  return {
    kind: "unknown_command",
    reply: `Unknown Grand command: ${command.name}\nTry: grand help`
  };
}

async function handleGrandCommandAsync(state, command, actor, options) {
  if (command.name === "github_sync") {
    const result = await syncGitHubIssuesToTasks(state, {
      ...options.github,
      repo: command.repo || options.github?.repo,
      clock: options.clock
    });

    return {
      kind: "github_sync",
      result,
      metrics: getMetrics(state),
      reply: formatGitHubSyncReply(result)
    };
  }

  return handleGrandCommand(state, command, actor, options);
}

export function parseGrandCommand(text) {
  const cleaned = text.trim();
  const prefixed = cleaned.match(/^\/?grand(?:\s+(.+))?$/i);

  if (prefixed) {
    const body = (prefixed[1] || "help").trim();
    const [name, ...rest] = body.split(/\s+/);
    return normalizeGrandCommand(name, rest.join(" "));
  }

  const legacy = cleaned.match(/^(status|approve|reject|done)(?:\s+(\S+))?$/i);
  if (!legacy) return null;

  return {
    name: legacy[1].toLowerCase(),
    taskId: legacy[2] || null
  };
}

function formatTaskReply(task) {
  if (task.status === "blocked") {
    return `${task.id} blocked by policy: ${task.title}\nReason: ${task.risk.reasons.join(", ")}`;
  }

  if (task.status === "needs_approval") {
    return [
      `${task.id} needs approval before Grand can act.`,
      `Task: ${task.title}`,
      `Approve: grand approve ${task.id}`,
      `Reject: grand reject ${task.id}`
    ].join("\n");
  }

  return `${task.id} queued: ${task.title}\nRun queued work with: grand run`;
}

function formatStatusReply(metrics) {
  return [
    `${metrics.total} total`,
    `${metrics.queued} queued`,
    `${metrics.needsApproval} need approval`,
    `${metrics.completed} completed`,
    `${metrics.blocked} blocked`
  ].join(" · ");
}

function normalizeGrandCommand(rawName, rawArgument) {
  const name = rawName.toLowerCase();
  const words = rawArgument.trim().split(/\s+/).filter(Boolean);

  if (name === "help" || name === "status" || name === "run" || name === "next") {
    return { name, taskId: null };
  }

  if (name === "report" || name === "brief" || name === "summary") {
    return { name: "report", taskId: null };
  }

  if (name === "list" || name === "ls") {
    return {
      name: "list",
      filter: normalizeListFilter(rawArgument),
      taskId: null
    };
  }

  if (name === "github" || name === "gh") {
    const [action = "sync", ...rest] = words;

    if (action.toLowerCase() === "sync") {
      return {
        name: "github_sync",
        repo: rest[0] || null
      };
    }

    return {
      name: "github",
      rawArgument
    };
  }

  if (name === "sync" && (words[0]?.toLowerCase() === "github" || words[0]?.toLowerCase() === "gh")) {
    return {
      name: "github_sync",
      repo: words[1] || null
    };
  }

  if (name === "task" || name === "show") {
    return {
      name: "task",
      taskId: rawArgument.trim() || null
    };
  }

  if (name === "approve" || name === "reject" || name === "done") {
    return {
      name,
      taskId: rawArgument.trim() || null
    };
  }

  return {
    name,
    rawArgument
  };
}

function normalizeListFilter(value) {
  const filter = value.trim().toLowerCase().replaceAll("-", "_");
  if (!filter) return "open";
  if (filter === "approval" || filter === "approvals" || filter === "needs_approval") return "needs_approval";
  if (filter === "queue") return "queued";
  if (filter === "all" || filter === "queued" || filter === "completed" || filter === "blocked" || filter === "rejected") {
    return filter;
  }
  return "open";
}

function selectTasksForList(tasks, filter = "open") {
  const filtered =
    filter === "all"
      ? tasks
      : filter === "open"
        ? tasks.filter((task) => task.status === "needs_approval" || task.status === "queued" || task.status === "blocked")
        : tasks.filter((task) => task.status === filter);

  return filtered.slice(0, 8);
}

function formatTaskListReply(tasks, filter = "open") {
  if (tasks.length === 0) {
    return `No ${formatFilterLabel(filter)} tasks.`;
  }

  const lines = [`${formatFilterLabel(filter)} tasks (${tasks.length} shown)`];

  for (const task of tasks) {
    lines.push(`${task.id} · ${formatStatus(task.status)} · ${task.title}`);

    if (task.status === "needs_approval") {
      lines.push(`Approve: grand approve ${task.id}`);
    }
  }

  return lines.join("\n");
}

function formatReportReply(state, metrics) {
  const lines = ["Grand report", formatStatusReply(metrics)];
  const openTasks = selectTasksForList(state.tasks, "open");
  const recentCompleted = selectTasksForList(state.tasks, "completed").slice(0, 3);

  if (openTasks.length > 0) {
    lines.push("Needs attention:");
    for (const task of openTasks.slice(0, 5)) {
      lines.push(`${task.id} · ${formatStatus(task.status)} · ${task.title}`);
    }
  } else {
    lines.push("No open work.");
  }

  if (recentCompleted.length > 0) {
    lines.push("Recent completions:");
    for (const task of recentCompleted) {
      lines.push(`${task.id} · ${task.runner.result?.summary || task.title}`);
    }
  }

  return lines.join("\n");
}

function formatNextReply(state) {
  const approvals = selectTasksForList(state.tasks, "needs_approval");
  if (approvals.length > 0) {
    const task = approvals[0];
    return [
      `Next: review ${task.id}`,
      task.title,
      `Approve: grand approve ${task.id}`,
      `Reject: grand reject ${task.id}`
    ].join("\n");
  }

  const queued = selectTasksForList(state.tasks, "queued");
  if (queued.length > 0) {
    return `Next: run ${queued.length} queued task${queued.length === 1 ? "" : "s"} with: grand run`;
  }

  const blocked = selectTasksForList(state.tasks, "blocked");
  if (blocked.length > 0) {
    return `Next: review ${blocked.length} blocked task${blocked.length === 1 ? "" : "s"} with: grand list blocked`;
  }

  return "No open work. Send Grand a customer, ops, or research request.";
}

function formatTaskDetailReply(task) {
  const lines = [
    `${task.id}`,
    `Status: ${formatStatus(task.status)}`,
    `Title: ${task.title}`,
    `Source: ${task.source.channel} from ${task.source.from}`,
    `Risk: ${task.risk.level} (${task.risk.reasons.join(", ")})`
  ];

  if (task.due) {
    lines.push(`Due: ${task.due}`);
  }

  if (task.status === "needs_approval") {
    lines.push(`Approve: grand approve ${task.id}`);
    lines.push(`Reject: grand reject ${task.id}`);
  }

  if (task.status === "queued") {
    lines.push("Run queued work with: grand run");
  }

  if (task.runner.result?.summary) {
    lines.push(`Result: ${task.runner.result.summary}`);
  }

  return lines.join("\n");
}

function formatGitHubSyncReply(result) {
  const lines = [
    `GitHub sync: ${result.repo}`,
    `${result.seen} open issue${result.seen === 1 ? "" : "s"} scanned · ${result.created.length} new task${result.created.length === 1 ? "" : "s"} · ${result.skipped.length} already tracked`
  ];

  if (result.created.length > 0) {
    lines.push("New tasks:");
    for (const item of result.created.slice(0, 5)) {
      lines.push(`${item.task.id} · #${item.issue.number} · ${item.task.title}`);
      lines.push(`Inspect: grand task ${item.task.id}`);
    }
  } else {
    lines.push("No new GitHub issue tasks.");
  }

  return lines.join("\n");
}

function formatRunReply(results, state) {
  if (results.length === 0) {
    return "No queued work was ready.";
  }

  const completed = results.filter((result) => result.outcome === "completed").length;
  const waiting = results.filter((result) => result.outcome === "waiting").length;
  const blocked = results.filter((result) => result.outcome === "blocked").length;
  const lines = [`Run complete: ${completed} completed · ${waiting} waiting · ${blocked} blocked`];

  for (const result of results.slice(0, 5)) {
    const task = state.tasks.find((candidate) => candidate.id === result.taskId);
    lines.push(`${result.taskId} · ${result.outcome}${task ? ` · ${task.title}` : ""}`);
  }

  if (results.length > 5) {
    lines.push(`+${results.length - 5} more`);
  }

  return lines.join("\n");
}

function formatHelpReply() {
  return [
    "Grand commands:",
    "grand status",
    "grand report",
    "grand next",
    "grand github sync",
    "grand list",
    "grand list approvals",
    "grand task <task-id>",
    "grand approve <task-id>",
    "grand reject <task-id>",
    "grand run",
    "grand done <task-id>"
  ].join("\n");
}

function formatFilterLabel(filter) {
  if (filter === "needs_approval") return "Approval";
  if (filter === "queued") return "Queued";
  if (filter === "completed") return "Completed";
  if (filter === "blocked") return "Blocked";
  if (filter === "rejected") return "Rejected";
  if (filter === "all") return "All";
  return "Open";
}

function formatStatus(status) {
  return status.replaceAll("_", " ");
}

function requireCommandTaskId(command, name) {
  if (!command.taskId) {
    throw new Error(`Usage: grand ${name} <task-id>`);
  }
}
