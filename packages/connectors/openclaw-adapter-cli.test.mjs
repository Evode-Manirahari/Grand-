import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGrandEventRequest,
  buildOpenClawSendArgs,
  parseAdapterArgs
} from "./openclaw-adapter-cli.mjs";

test("parses adapter flags into an OpenClaw event", () => {
  const options = parseAdapterArgs([
    "--grand-url",
    "http://grand.local",
    "--secret",
    "secret",
    "--channel",
    "slack",
    "--from",
    "maya",
    "--target",
    "C123",
    "--thread-id",
    "thread_1",
    "--message-id",
    "m_1",
    "--text",
    "grand status",
    "--send-reply"
  ]);

  assert.equal(options.grandUrl, "http://grand.local");
  assert.equal(options.secret, "secret");
  assert.equal(options.sendReply, true);
  assert.equal(options.event.channel, "slack");
  assert.equal(options.event.from, "maya");
  assert.equal(options.event.peer, "C123");
  assert.equal(options.event.threadId, "thread_1");
  assert.equal(options.event.message.id, "m_1");
  assert.equal(options.event.message.text, "grand status");
});

test("builds Grand event requests with bearer auth", () => {
  const request = buildGrandEventRequest(
    "http://grand.local",
    {
      channel: "slack",
      from: "maya",
      message: {
        text: "Summarize this."
      }
    },
    "top-secret"
  );

  assert.equal(request.endpoint.toString(), "http://grand.local/api/openclaw/events");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, "Bearer top-secret");
  assert.equal(JSON.parse(request.body).channel, "slack");
});

test("builds OpenClaw reply command arguments", () => {
  assert.deepEqual(
    buildOpenClawSendArgs({
      channel: "slack",
      target: "C123",
      threadId: "thread_1",
      text: "task queued"
    }),
    ["message", "send", "--target", "C123", "--message", "task queued"]
  );
});
