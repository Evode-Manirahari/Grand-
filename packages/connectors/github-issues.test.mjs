import assert from "node:assert/strict";
import test from "node:test";
import { createGrandState } from "../core/task-engine.mjs";
import { createGitHubIssueTask, parseGitHubRepo, syncGitHubIssuesToTasks } from "./github-issues.mjs";

test("parses GitHub repo references", () => {
  assert.deepEqual(parseGitHubRepo("Evode-Manirahari/Grand-"), {
    owner: "Evode-Manirahari",
    repo: "Grand-",
    fullName: "Evode-Manirahari/Grand-"
  });
  assert.deepEqual(parseGitHubRepo("https://github.com/openclaw/clawsweeper"), {
    owner: "openclaw",
    repo: "clawsweeper",
    fullName: "openclaw/clawsweeper"
  });
});

test("syncs open GitHub issues into Grand tasks and dedupes by URL", async () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const issue = {
    number: 7,
    title: "Add onboarding checklist",
    body: "Make the first-run experience easier.",
    html_url: "https://github.com/Evode-Manirahari/Grand-/issues/7",
    user: {
      login: "maya"
    }
  };
  const fetchIssues = async () => [issue];

  const first = await syncGitHubIssuesToTasks(state, {
    repo: "Evode-Manirahari/Grand-",
    fetchIssues,
    clock: new Date("2026-05-02T12:05:00Z")
  });
  const second = await syncGitHubIssuesToTasks(state, {
    repo: "Evode-Manirahari/Grand-",
    fetchIssues,
    clock: new Date("2026-05-02T12:06:00Z")
  });

  assert.equal(first.seen, 1);
  assert.equal(first.created.length, 1);
  assert.equal(first.created[0].task.source.channel, "github");
  assert.equal(first.created[0].task.source.url, issue.html_url);
  assert.equal(second.created.length, 0);
  assert.equal(second.skipped.length, 1);
  assert.equal(state.tasks.length, 1);
});

test("creates a GitHub issue and tracks it as a Grand task", async () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const result = await createGitHubIssueTask(
    state,
    {
      repo: "Evode-Manirahari/Grand-",
      title: "Add Telegram onboarding copy",
      body: "Make the first reply easier to understand."
    },
    {
      createIssue: async (repo, input) => ({
        number: 8,
        title: input.title,
        body: input.body,
        html_url: `https://github.com/${repo}/issues/8`,
        user: {
          login: "evy"
        }
      }),
      clock: new Date("2026-05-02T12:07:00Z")
    }
  );

  assert.equal(result.repo, "Evode-Manirahari/Grand-");
  assert.equal(result.issue.number, 8);
  assert.equal(result.createdTask, true);
  assert.equal(result.task.source.channel, "github");
  assert.equal(result.task.source.url, "https://github.com/Evode-Manirahari/Grand-/issues/8");
  assert.equal(state.tasks.length, 1);
});
