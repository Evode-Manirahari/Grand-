const RISKY_PATTERNS = [
  /\b(refund|pay|payment|charge|invoice|wire|transfer)\b/i,
  /\b(send|email|message|notify|publish|post)\b/i,
  /\b(delete|remove|cancel|close|terminate|ban)\b/i,
  /\b(order|purchase|buy|subscribe|upgrade|downgrade)\b/i,
  /\b(export|share|upload|download customer data)\b/i
];

const BLOCKED_PATTERNS = [
  /\b(password|secret|private key|api key|seed phrase)\b/i,
  /\bdisable security|bypass approval|ignore policy\b/i,
  /\bdelete all|wipe\b/i
];

const SAFE_PATTERNS = [
  /\b(summarize|recap|draft|organize|research|check|remind|schedule draft)\b/i,
  /\b(status|follow up|follow-up|create task|make a list)\b/i
];

export function createGrandState(clock = new Date()) {
  const createdAt = toIso(clock);

  return {
    version: 1,
    createdAt,
    updatedAt: createdAt,
    tasks: [],
    events: []
  };
}

export function createTaskFromMessage(state, message, options = {}) {
  assertState(state);

  const clock = options.clock ?? new Date();
  const risk = classifyRisk(message.text);
  const id = options.id ?? makeId("task", clock, state.tasks.length + 1);
  const task = {
    id,
    title: inferTitle(message.text),
    source: {
      channel: normalizeChannel(message.channel),
      from: message.from?.trim() || "unknown",
      text: message.text.trim(),
      url: message.url || null,
      receivedAt: toIso(clock)
    },
    risk,
    status: risk.level === "blocked" ? "blocked" : risk.approvalRequired ? "needs_approval" : "queued",
    approval: {
      required: risk.approvalRequired,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null
    },
    runner: {
      attempts: 0,
      lastRunAt: null,
      result: null
    },
    due: inferDueDate(message.text, clock),
    createdAt: toIso(clock),
    updatedAt: toIso(clock)
  };

  state.tasks.unshift(task);
  pushEvent(state, {
    type: "task.created",
    taskId: task.id,
    actor: message.from || "unknown",
    summary: `${task.source.channel} message became ${task.id}`,
    at: toIso(clock)
  });
  touch(state, clock);

  return task;
}

export function approveTask(state, taskId, actor = "operator", clock = new Date()) {
  const task = requireTask(state, taskId);

  if (task.status === "blocked") {
    throw new Error(`Cannot approve blocked task ${taskId}`);
  }

  task.approval.approvedBy = actor;
  task.approval.approvedAt = toIso(clock);
  task.approval.rejectedBy = null;
  task.approval.rejectedAt = null;
  task.status = "queued";
  task.updatedAt = toIso(clock);

  pushEvent(state, {
    type: "task.approved",
    taskId,
    actor,
    summary: `${actor} approved ${taskId}`,
    at: toIso(clock)
  });
  touch(state, clock);

  return task;
}

export function rejectTask(state, taskId, actor = "operator", clock = new Date()) {
  const task = requireTask(state, taskId);

  task.approval.rejectedBy = actor;
  task.approval.rejectedAt = toIso(clock);
  task.status = "rejected";
  task.updatedAt = toIso(clock);

  pushEvent(state, {
    type: "task.rejected",
    taskId,
    actor,
    summary: `${actor} rejected ${taskId}`,
    at: toIso(clock)
  });
  touch(state, clock);

  return task;
}

export function completeTask(state, taskId, result, clock = new Date()) {
  const task = requireTask(state, taskId);

  task.status = "completed";
  task.runner.result = result;
  task.runner.lastRunAt = toIso(clock);
  task.updatedAt = toIso(clock);

  pushEvent(state, {
    type: "task.completed",
    taskId,
    actor: "runner",
    summary: result.summary || `${taskId} completed`,
    at: toIso(clock)
  });
  touch(state, clock);

  return task;
}

export function blockTask(state, taskId, reason, clock = new Date()) {
  const task = requireTask(state, taskId);

  task.status = "blocked";
  task.risk = {
    ...task.risk,
    level: "blocked",
    approvalRequired: true,
    reasons: [...new Set([...task.risk.reasons, reason])]
  };
  task.updatedAt = toIso(clock);

  pushEvent(state, {
    type: "task.blocked",
    taskId,
    actor: "policy",
    summary: `${taskId} blocked: ${reason}`,
    at: toIso(clock)
  });
  touch(state, clock);

  return task;
}

export function incrementAttempt(state, taskId, clock = new Date()) {
  const task = requireTask(state, taskId);

  task.runner.attempts += 1;
  task.runner.lastRunAt = toIso(clock);
  task.updatedAt = toIso(clock);
  touch(state, clock);

  return task;
}

export function requireTask(state, taskId) {
  assertState(state);
  const task = state.tasks.find((candidate) => candidate.id === taskId);

  if (!task) {
    throw new Error(`Task ${taskId} was not found`);
  }

  return task;
}

export function getMetrics(state) {
  assertState(state);

  const base = {
    total: state.tasks.length,
    queued: 0,
    needsApproval: 0,
    completed: 0,
    rejected: 0,
    blocked: 0
  };

  for (const task of state.tasks) {
    if (task.status === "queued") base.queued += 1;
    if (task.status === "needs_approval") base.needsApproval += 1;
    if (task.status === "completed") base.completed += 1;
    if (task.status === "rejected") base.rejected += 1;
    if (task.status === "blocked") base.blocked += 1;
  }

  return base;
}

export function seedDemoTasks(state, clock = new Date()) {
  if (state.tasks.length > 0) return state;

  createTaskFromMessage(
    state,
    {
      channel: "slack",
      from: "maya@northstar.agency",
      text: "Summarize the client feedback from today and make a follow-up checklist for tomorrow."
    },
    { clock: offsetMinutes(clock, -28) }
  );

  createTaskFromMessage(
    state,
    {
      channel: "telegram",
      from: "ops-lead",
      text: "Refund customer INV-1042 if the duplicate charge is real and send them a short update."
    },
    { clock: offsetMinutes(clock, -16) }
  );

  createTaskFromMessage(
    state,
    {
      channel: "webchat",
      from: "founder",
      text: "Check the open support requests and draft a daily digest."
    },
    { clock: offsetMinutes(clock, -7) }
  );

  state.updatedAt = toIso(clock);
  return state;
}

export function classifyRisk(text) {
  const cleaned = text.trim();
  const reasons = [];

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cleaned)) {
      reasons.push("blocked_sensitive_or_destructive");
      return {
        level: "blocked",
        approvalRequired: true,
        reasons,
        allowedMode: "none"
      };
    }
  }

  for (const pattern of RISKY_PATTERNS) {
    if (pattern.test(cleaned)) reasons.push("external_or_mutating_action");
  }

  const hasSafeIntent = SAFE_PATTERNS.some((pattern) => pattern.test(cleaned));

  if (reasons.length > 0) {
    return {
      level: "approval",
      approvalRequired: true,
      reasons: [...new Set(reasons)],
      allowedMode: "draft_then_approve"
    };
  }

  return {
    level: hasSafeIntent ? "safe" : "review",
    approvalRequired: !hasSafeIntent,
    reasons: hasSafeIntent ? ["read_or_draft_work"] : ["unclear_intent"],
    allowedMode: hasSafeIntent ? "auto_run" : "human_triage"
  };
}

function inferTitle(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const sentence = cleaned.split(/[.!?]/)[0] || cleaned;
  const title = sentence.length > 76 ? `${sentence.slice(0, 73).trim()}...` : sentence;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function inferDueDate(text, clock) {
  const lower = text.toLowerCase();
  const base = new Date(clock);

  if (/\btoday\b|\beod\b/.test(lower)) {
    base.setHours(17, 0, 0, 0);
    return toIso(base);
  }

  if (/\btomorrow\b/.test(lower)) {
    base.setDate(base.getDate() + 1);
    base.setHours(9, 0, 0, 0);
    return toIso(base);
  }

  if (/\bnext week\b/.test(lower)) {
    base.setDate(base.getDate() + 7);
    base.setHours(9, 0, 0, 0);
    return toIso(base);
  }

  return null;
}

function normalizeChannel(channel) {
  return (channel || "webchat").toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function pushEvent(state, event) {
  state.events.unshift({
    id: makeId("evt", event.at, state.events.length + 1),
    ...event
  });
}

function touch(state, clock) {
  state.updatedAt = toIso(clock);
}

function assertState(state) {
  if (!state || !Array.isArray(state.tasks) || !Array.isArray(state.events)) {
    throw new Error("Grand state is invalid");
  }
}

function makeId(prefix, clock, counter) {
  const date = toIso(clock).replace(/\D/g, "").slice(0, 14);
  const suffix = String(counter).padStart(4, "0");
  return `${prefix}_${date}_${suffix}`;
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function offsetMinutes(clock, minutes) {
  return new Date(new Date(clock).getTime() + minutes * 60_000);
}
