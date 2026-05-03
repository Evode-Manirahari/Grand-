import { completeTask, createTaskFromMessage, requireTask } from "../core/task-engine.mjs";

export function parseGitHubRepo(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("GitHub repo is required. Use: grand github sync owner/repo");
  }

  const cleaned = value.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\/+$/g, "");
  const [owner, repo, ...extra] = cleaned.split("/");

  if (!owner || !repo || extra.length > 0) {
    throw new Error(`Invalid GitHub repo "${value}". Use owner/repo.`);
  }

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`
  };
}

export async function fetchGitHubIssues(repo, options = {}) {
  const parsed = parseGitHubRepo(repo);
  const limit = clampLimit(options.limit ?? 10);
  const url = new URL(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/issues`);
  url.searchParams.set("state", "open");
  url.searchParams.set("per_page", String(limit));

  if (options.labels) {
    url.searchParams.set("labels", Array.isArray(options.labels) ? options.labels.join(",") : String(options.labels));
  }

  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "grand-ops"
  };

  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(url, { headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`GitHub issues fetch failed for ${parsed.fullName}: ${data.message || response.statusText}`);
  }

  return Array.isArray(data) ? data.filter((issue) => !issue.pull_request) : [];
}

export async function createGitHubIssue(repo, input, options = {}) {
  const parsed = parseGitHubRepo(repo);
  const title = requireIssueTitle(input?.title);
  const body = input?.body || "";

  if (!options.token) {
    throw new Error("GitHub token required to create issues. Set GITHUB_TOKEN or GH_TOKEN.");
  }

  const response = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/issues`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${options.token}`,
      "content-type": "application/json",
      "user-agent": "grand-ops"
    },
    body: JSON.stringify({
      title,
      body,
      labels: normalizeLabels(input?.labels)
    })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`GitHub issue create failed for ${parsed.fullName}: ${data.message || response.statusText}`);
  }

  return data;
}

export async function syncGitHubIssuesToTasks(state, options = {}) {
  const parsed = parseGitHubRepo(options.repo);
  const fetchIssues = options.fetchIssues || fetchGitHubIssues;
  const issues = await fetchIssues(parsed.fullName, options);
  const created = [];
  const skipped = [];

  for (const issue of issues) {
    if (!issue || issue.pull_request) continue;

    const tracked = trackGitHubIssueTask(state, parsed.fullName, issue, options);

    if (!tracked.created) {
      skipped.push({ issue, task: tracked.task, reason: "already_tracked" });
      continue;
    }

    created.push({ issue, task: tracked.task });
  }

  return {
    repo: parsed.fullName,
    seen: issues.length,
    created,
    skipped
  };
}

export async function createGitHubIssueTask(state, input, options = {}) {
  const parsed = parseGitHubRepo(input.repo || options.repo);
  const createIssue = options.createIssue || createGitHubIssue;
  const issue = await createIssue(
    parsed.fullName,
    {
      title: input.title,
      body: input.body,
      labels: input.labels
    },
    options
  );
  const tracked = trackGitHubIssueTask(state, parsed.fullName, issue, options);

  return {
    repo: parsed.fullName,
    issue,
    task: tracked.task,
    createdTask: tracked.created
  };
}

export function createGitHubIssueDraftTask(state, input, options = {}) {
  const parsed = parseGitHubRepo(input.repo || options.repo);
  const title = requireIssueTitle(input.title);
  const task = createTaskFromMessage(
    state,
    {
      channel: "github",
      from: input.actor || "operator",
      text: [
        `Draft GitHub issue in ${parsed.fullName}: ${title}`,
        "",
        "This is a local draft because GitHub issue creation is not configured.",
        "Set GITHUB_TOKEN or GH_TOKEN, then create the issue from this draft."
      ].join("\n"),
      url: null
    },
    { clock: options.clock }
  );

  return {
    repo: parsed.fullName,
    title,
    task
  };
}

export function listGitHubIssueDraftTasks(state, options = {}) {
  const limit = clampLimit(options.limit ?? 8);

  return state.tasks
    .map((task) => {
      const draft = getGitHubIssueDraftInfo(task);
      return draft ? { ...draft, task } : null;
    })
    .filter(Boolean)
    .slice(0, limit);
}

export async function publishGitHubIssueDraftTask(state, taskId, options = {}) {
  const task = requireTask(state, taskId);
  const draft = getGitHubIssueDraftInfo(task);

  if (!draft) {
    throw new Error(`Task ${taskId} is not a local GitHub issue draft.`);
  }

  if (!options.token && !options.createIssue) {
    throw new Error("GitHub token required to publish drafts. Set GITHUB_TOKEN or GH_TOKEN.");
  }

  const parsed = parseGitHubRepo(draft.repo);
  const createIssue = options.createIssue || createGitHubIssue;
  const issue = await createIssue(
    parsed.fullName,
    {
      title: draft.title,
      body: formatDraftIssueBody(task, options.actor),
      labels: options.createLabels || options.labels
    },
    options
  );
  const url = issue.html_url || `https://github.com/${parsed.fullName}/issues/${issue.number}`;

  task.title = `GitHub issue #${issue.number} in ${parsed.fullName}: ${issue.title}`;
  task.source.url = url;
  task.source.text = formatIssueTaskText(parsed.fullName, issue);
  task.source.from = issue.user?.login || task.source.from;

  completeTask(
    state,
    task.id,
    {
      mode: "github_issue_publish",
      summary: `Created ${parsed.fullName}#${issue.number}`,
      url
    },
    options.clock
  );

  return {
    repo: parsed.fullName,
    issue,
    task
  };
}

export function trackGitHubIssueTask(state, repo, issue, options = {}) {
  const parsed = parseGitHubRepo(repo);
  const url = issue.html_url || `https://github.com/${parsed.fullName}/issues/${issue.number}`;
  const existing = state.tasks.find((task) => task.source.url === url);

  if (existing) {
    return {
      task: existing,
      created: false
    };
  }

  const task = createTaskFromMessage(
    state,
    {
      channel: "github",
      from: issue.user?.login || parsed.fullName,
      text: formatIssueTaskText(parsed.fullName, issue),
      url
    },
    { clock: options.clock }
  );

  return {
    task,
    created: true
  };
}

export function getGitHubIssueDraftInfo(task) {
  if (!task || task.source?.channel !== "github" || task.source?.url) return null;
  const match = task.source.text?.match(/^Draft GitHub issue in ([^:]+):\s*(.+)$/m);
  if (!match) return null;

  return {
    repo: match[1].trim(),
    title: match[2].trim()
  };
}

function formatIssueTaskText(repo, issue) {
  const body = typeof issue.body === "string" && issue.body.trim() ? `\n\n${issue.body.trim().slice(0, 600)}` : "";
  return `GitHub issue #${issue.number} in ${repo}: ${issue.title}${body}`;
}

function formatDraftIssueBody(task, actor) {
  return [
    `Created from Grand draft ${task.id}${actor ? ` by ${actor}` : ""}.`,
    "",
    task.source.text
  ].join("\n");
}

function requireIssueTitle(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("GitHub issue title is required. Use: grand github issue <title>");
  }

  return value.trim();
}

function normalizeLabels(value) {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map((label) => String(label).trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(50, Math.max(1, Math.trunc(parsed)));
}
