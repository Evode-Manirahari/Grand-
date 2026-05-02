import {
  approveTask,
  completeTask,
  createTaskFromMessage,
  getMetrics,
  rejectTask
} from "../core/task-engine.mjs";

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

  if (command.name === "status") {
    return {
      kind: "status",
      metrics: getMetrics(state),
      reply: formatStatusReply(getMetrics(state))
    };
  }

  if (command.name === "approve") {
    const task = approveTask(state, command.taskId, actor, options.clock);
    return {
      kind: "task_approved",
      task,
      reply: `${task.id} approved and queued.`
    };
  }

  if (command.name === "reject") {
    const task = rejectTask(state, command.taskId, actor, options.clock);
    return {
      kind: "task_rejected",
      task,
      reply: `${task.id} rejected.`
    };
  }

  if (command.name === "done") {
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
      reply: `${task.id} marked complete.`
    };
  }

  return {
    kind: "unknown_command",
    reply: "Unknown Grand command."
  };
}

export function parseGrandCommand(text) {
  const cleaned = text.trim();
  const match = cleaned.match(/^(?:grand\s+|\/grand\s+)?(status|approve|reject|done)(?:\s+(\S+))?$/i);

  if (!match) return null;

  return {
    name: match[1].toLowerCase(),
    taskId: match[2] || null
  };
}

function formatTaskReply(task) {
  if (task.status === "blocked") {
    return `${task.id} is blocked by policy.`;
  }

  if (task.status === "needs_approval") {
    return `${task.id} needs approval before Grand can act.`;
  }

  return `${task.id} is queued.`;
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
