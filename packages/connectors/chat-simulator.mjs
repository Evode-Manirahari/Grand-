import {
  approveTask,
  completeTask,
  createTaskFromMessage,
  getMetrics,
  rejectTask
} from "../core/task-engine.mjs";
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

  if (name === "help" || name === "status" || name === "run") {
    return { name, taskId: null };
  }

  if (name === "list" || name === "ls") {
    return {
      name: "list",
      filter: normalizeListFilter(rawArgument),
      taskId: null
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
    "grand list",
    "grand list approvals",
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
