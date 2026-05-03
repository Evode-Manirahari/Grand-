import assert from "node:assert/strict";
import test from "node:test";
import { createGrandState } from "../core/task-engine.mjs";
import {
  createGitHubIssueDraftTask,
  createGitHubIssueTask,
  listGitHubIssueDraftTasks,
  parseGitHubRepo,
  publishGitHubIssueDraftTask,
  syncGitHubIssuesToTasks
} from "./github-issues.mjs";

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

test("creates a local GitHub issue draft task", () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const result = createGitHubIssueDraftTask(
    state,
    {
      repo: "Evode-Manirahari/Grand-",
      title: "Add token setup checklist",
      actor: "owner"
    },
    {
      clock: new Date("2026-05-02T12:09:00Z")
    }
  );

  assert.equal(result.repo, "Evode-Manirahari/Grand-");
  assert.equal(result.title, "Add token setup checklist");
  assert.equal(result.task.source.channel, "github");
  assert.match(result.task.source.text, /local draft/);
  assert.equal(state.tasks.length, 1);
});

test("lists local GitHub issue draft tasks", () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  createGitHubIssueDraftTask(
    state,
    {
      repo: "Evode-Manirahari/Grand-",
      title: "Add draft listing",
      actor: "owner"
    },
    {
      clock: new Date("2026-05-02T12:10:00Z")
    }
  );
  createGitHubIssueDraftTask(
    state,
    {
      repo: "openclaw/clawsweeper",
      title: "Add publish command",
      actor: "owner"
    },
    {
      clock: new Date("2026-05-02T12:11:00Z")
    }
  );

  const drafts = listGitHubIssueDraftTasks(state);

  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].repo, "openclaw/clawsweeper");
  assert.equal(drafts[0].title, "Add publish command");
  assert.equal(drafts[1].repo, "Evode-Manirahari/Grand-");
});

test("publishes a local GitHub issue draft and completes the task", async () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const draft = createGitHubIssueDraftTask(
    state,
    {
      repo: "Evode-Manirahari/Grand-",
      title: "Add publish command",
      actor: "owner"
    },
    {
      clock: new Date("2026-05-02T12:10:00Z")
    }
  );

  const result = await publishGitHubIssueDraftTask(state, draft.task.id, {
    createIssue: async (repo, input) => {
      assert.equal(repo, "Evode-Manirahari/Grand-");
      assert.equal(input.title, "Add publish command");
      assert.match(input.body, new RegExp(draft.task.id));
      return {
        number: 21,
        title: input.title,
        body: input.body,
        html_url: `https://github.com/${repo}/issues/21`,
        user: {
          login: "owner"
        }
      };
    },
    actor: "owner",
    clock: new Date("2026-05-02T12:12:00Z")
  });

  assert.equal(result.repo, "Evode-Manirahari/Grand-");
  assert.equal(result.issue.number, 21);
  assert.equal(result.task.status, "completed");
  assert.equal(result.task.source.url, "https://github.com/Evode-Manirahari/Grand-/issues/21");
  assert.equal(result.task.runner.result.mode, "github_issue_publish");
  assert.equal(listGitHubIssueDraftTasks(state).length, 0);
});
