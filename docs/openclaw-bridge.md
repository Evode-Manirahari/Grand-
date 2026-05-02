# OpenClaw Bridge

Grand exposes an authenticated event endpoint for OpenClaw channel messages:

```text
POST /api/openclaw/events
```

The bridge turns OpenClaw messages into Grand tasks by routing normalized message
text through the same task engine used by the local simulator.

## Run Grand

```bash
GRAND_OPENCLAW_SECRET=replace-with-a-long-random-secret npm run dev
```

For local experiments, Grand accepts events without a secret when
`GRAND_OPENCLAW_SECRET` is not set. Set the secret before exposing the endpoint to
OpenClaw or a tunnel.

## Authentication

Send the shared secret in one of these headers:

```text
Authorization: Bearer replace-with-a-long-random-secret
```

or:

```text
X-Grand-Secret: replace-with-a-long-random-secret
```

Invalid or missing secrets return `401`.

## Canonical Payload

```json
{
  "type": "channel.message",
  "channel": {
    "type": "slack",
    "id": "C123"
  },
  "from": {
    "id": "U123",
    "displayName": "Maya"
  },
  "message": {
    "id": "m_1",
    "text": "Refund invoice INV-1042 if it is a duplicate charge.",
    "timestamp": "2026-05-02T12:00:00Z",
    "url": "https://example.com/messages/m_1"
  },
  "reply": {
    "target": "C123",
    "threadId": "thread_1"
  }
}
```

Grand also accepts a smaller shape for simple adapters:

```json
{
  "channel": "telegram",
  "from": "ops-lead",
  "peer": "chat_7",
  "message": {
    "text": "Summarize today's support requests."
  }
}
```

Batch delivery is supported:

```json
{
  "events": [
    {
      "channel": "slack",
      "from": "maya",
      "message": {
        "text": "Check open requests and draft a digest."
      }
    }
  ]
}
```

## Response

Grand returns a channel reply payload that an OpenClaw adapter can send back to
the original chat target:

```json
{
  "results": [
    {
      "kind": "task_created",
      "reply": {
        "type": "channel.reply",
        "channel": "slack",
        "target": "C123",
        "threadId": "thread_1",
        "inReplyTo": "m_1",
        "text": "task_20260502120000_0001 needs approval before Grand can act."
      }
    }
  ]
}
```

## Commands From Chat

The bridge routes Grand commands from OpenClaw messages:

```text
grand status
grand report
grand next
grand github sync
grand github issue <title>
grand list
grand list approvals
grand task <task-id>
grand approve <task-id>
grand reject <task-id>
grand run
grand done <task-id>
```

This means an OpenClaw channel can complete the first useful loop:

1. A user sends work into Slack, Telegram, Discord, WhatsApp, or WebChat.
2. OpenClaw forwards the message to Grand.
3. Grand creates a task and replies with queued or approval-needed status.
4. A user approves risky work from the same chat.
5. Grand queues the work and records an audit event.

## Manual Test

```bash
curl -s http://127.0.0.1:4173/api/openclaw/events \
  -H "content-type: application/json" \
  -H "authorization: Bearer $GRAND_OPENCLAW_SECRET" \
  -d '{
    "channel": "slack",
    "from": "maya",
    "peer": "C123",
    "message": {
      "text": "Summarize customer feedback for today."
    }
  }'
```
