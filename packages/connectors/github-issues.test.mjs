import assert from "node:assert/strict";
import test from "node:test";
import { createGrandState } from "../core/task-engine.mjs";
import { parseGitHubRepo, syncGitHubIssuesToTasks } from "./github-issues.mjs";

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
