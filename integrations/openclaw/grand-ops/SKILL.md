---
name: grand-ops
description: Forward OpenClaw channel messages into Grand Ops and return Grand's approval or status reply to the same chat.
metadata: {"openclaw":{"requires":{"bins":["node"]},"homepage":"https://github.com/Evode-Manirahari/Grand-"}}
---

# Grand Ops

Use this skill when a user wants Grand Ops to capture chat work, create a task,
check queue status, or approve/reject/mark done an existing Grand task.

Grand receives OpenClaw channel events at:

```text
POST /api/openclaw/events
```

The adapter in this skill posts the channel message to Grand and prints the
reply payload. When `--send-reply` is passed, it also sends Grand's returned
reply text back through the OpenClaw CLI.

## Required Environment

- `GRAND_URL`: Grand base URL, for example `http://127.0.0.1:4173`
- `GRAND_OPENCLAW_SECRET`: shared secret configured on the Grand server

## Forward A Channel Message

Run the adapter with the original channel, sender, target, and text:

```bash
node {baseDir}/bin/grand-openclaw-adapter.mjs \
  --channel "$OPENCLAW_CHANNEL" \
  --from "$OPENCLAW_SENDER" \
  --target "$OPENCLAW_TARGET" \
  --message-id "$OPENCLAW_MESSAGE_ID" \
  --text "$OPENCLAW_TEXT" \
  --send-reply
```

If the full OpenClaw event is already available as JSON, pipe it directly:

```bash
printf '%s' "$OPENCLAW_EVENT_JSON" | node {baseDir}/bin/grand-openclaw-adapter.mjs --json --send-reply
```

## Supported Chat Commands

Forward these messages exactly as written by the user:

```text
grand status
grand approve <task-id>
grand reject <task-id>
grand done <task-id>
```

Grand returns a short reply such as:

```text
task_20260502120000_0001 needs approval before Grand can act.
```

or:

```text
4 total · 3 queued · 1 need approval · 0 completed · 0 blocked
```

## Safety

Do not put secrets in the message text. Keep `GRAND_OPENCLAW_SECRET` in the
OpenClaw process environment or skill config, and rely on Grand's approval
states for external or mutating work.
