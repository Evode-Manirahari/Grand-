import assert from "node:assert/strict";
import test from "node:test";
import { createGrandState } from "../core/task-engine.mjs";
import {
  handleOpenClawEvent,
  normalizeOpenClawEvent,
  verifyOpenClawSecret
} from "./openclaw-bridge.mjs";

test("normalizes canonical OpenClaw message events", () => {
  const normalized = normalizeOpenClawEvent({
    type: "channel.message",
    channel: {
      type: "slack",
      id: "C123"
    },
    from: {
      displayName: "Maya"
    },
    message: {
      id: "m_1",
      text: "Summarize today's customer feedback.",
      timestamp: "2026-05-02T12:00:00Z",
      url: "https://openclaw.local/messages/m_1"
    },
    reply: {
      target: "C123",
      threadId: "thread_1"
    }
  });

  assert.equal(normalized.incoming.channel, "slack");
  assert.equal(normalized.incoming.from, "Maya");
  assert.equal(normalized.incoming.text, "Summarize today's customer feedback.");
  assert.equal(normalized.openclaw.target, "C123");
  assert.equal(normalized.openclaw.threadId, "thread_1");
  assert.equal(normalized.openclaw.messageId, "m_1");
  assert.equal(normalized.receivedAt.toISOString(), "2026-05-02T12:00:00.000Z");
});

test("handles OpenClaw events through the Grand task engine", () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const bridgeResult = handleOpenClawEvent(state, {
    channel: "telegram",
    from: "ops-lead",
    message: {
      id: "tg_1",
      text: "Refund INV-1042 and send a short update.",
      timestamp: "2026-05-02T12:05:00Z"
    },
    peer: "chat_7"
  });

  assert.equal(bridgeResult.kind, "task_created");
  assert.equal(bridgeResult.result.task.status, "needs_approval");
  assert.equal(bridgeResult.reply.type, "channel.reply");
  assert.equal(bridgeResult.reply.channel, "telegram");
  assert.equal(bridgeResult.reply.target, "chat_7");
  assert.match(bridgeResult.reply.text, /needs approval/);
});

test("routes approval commands from OpenClaw", () => {
  const state = createGrandState(new Date("2026-05-02T12:00:00Z"));
  const created = handleOpenClawEvent(state, {
    channel: "slack",
    from: "ops-lead",
    message: {
      text: "Refund INV-1042 and send a short update."
    }
  });
  const approved = handleOpenClawEvent(state, {
    channel: "slack",
    from: "owner",
    message: {
      text: `grand approve ${created.result.task.id}`
    }
  });

  assert.equal(approved.kind, "task_approved");
  assert.equal(created.result.task.status, "queued");
  assert.match(approved.reply.text, /approved and queued/);
});

test("verifies configured OpenClaw shared secrets", () => {
  assert.deepEqual(verifyOpenClawSecret({ authorization: "Bearer top-secret" }, "top-secret"), {
    ok: true,
    mode: "shared_secret"
  });
  assert.deepEqual(verifyOpenClawSecret({ "x-grand-secret": "wrong" }, "top-secret"), {
    ok: false,
    reason: "invalid_secret"
  });
  assert.deepEqual(verifyOpenClawSecret({}, "top-secret"), {
    ok: false,
    reason: "missing_secret"
  });
});
