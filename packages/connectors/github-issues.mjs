import { createTaskFromMessage } from "../core/task-engine.mjs";

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

export async function syncGitHubIssuesToTasks(state, options = {}) {
  const parsed = parseGitHubRepo(options.repo);
  const fetchIssues = options.fetchIssues || fetchGitHubIssues;
  const issues = await fetchIssues(parsed.fullName, options);
  const created = [];
  const skipped = [];

  for (const issue of issues) {
    if (!issue || issue.pull_request) continue;

    const url = issue.html_url || `https://github.com/${parsed.fullName}/issues/${issue.number}`;
    const existing = state.tasks.find((task) => task.source.url === url);

    if (existing) {
      skipped.push({ issue, task: existing, reason: "already_tracked" });
      continue;
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
    created.push({ issue, task });
  }

  return {
    repo: parsed.fullName,
    seen: issues.length,
    created,
    skipped
  };
}

function formatIssueTaskText(repo, issue) {
  const body = typeof issue.body === "string" && issue.body.trim() ? `\n\n${issue.body.trim().slice(0, 600)}` : "";
  return `GitHub issue #${issue.number} in ${repo}: ${issue.title}${body}`;
}

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(50, Math.max(1, Math.trunc(parsed)));
}
