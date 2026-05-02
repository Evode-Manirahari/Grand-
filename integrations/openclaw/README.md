# OpenClaw Integration

This folder contains a workspace-installable OpenClaw skill plus a Node adapter
for forwarding OpenClaw channel messages into Grand Ops.

## Install The Skill

From this repository:

```bash
mkdir -p ~/.openclaw/workspace/skills
cp -R integrations/openclaw/grand-ops ~/.openclaw/workspace/skills/grand-ops
```

Start a new OpenClaw session after installing so the skill snapshot refreshes.

## Configure Environment

Run Grand with a shared secret:

```bash
GRAND_OPENCLAW_SECRET=replace-with-a-long-random-secret npm run dev
```

Make the same values available to OpenClaw:

```bash
export GRAND_URL=http://127.0.0.1:4173
export GRAND_OPENCLAW_SECRET=replace-with-a-long-random-secret
```

## Adapter Usage

Forward a single message:

```bash
node integrations/openclaw/grand-ops/bin/grand-openclaw-adapter.mjs \
  --channel slack \
  --from maya \
  --target C123 \
  --message-id m_1 \
  --text "Summarize today's customer feedback."
```

Forward and send Grand's reply through OpenClaw:

```bash
node integrations/openclaw/grand-ops/bin/grand-openclaw-adapter.mjs \
  --channel slack \
  --from maya \
  --target C123 \
  --message-id m_1 \
  --text "grand status" \
  --send-reply
```

The adapter posts to `POST /api/openclaw/events`. With `--send-reply`, it runs:

```text
openclaw message send --target <target> --message <reply text>
```

Set `GRAND_OPENCLAW_CLI=/path/to/openclaw` if the `openclaw` binary is not on
`PATH`.

## JSON Mode

For exact OpenClaw event payloads:

```bash
printf '%s' "$OPENCLAW_EVENT_JSON" \
  | node integrations/openclaw/grand-ops/bin/grand-openclaw-adapter.mjs --json --send-reply
```

## First Working Loop

1. OpenClaw receives a channel message.
2. The `grand-ops` skill runs the adapter.
3. Grand creates a task or routes a command.
4. The adapter sends `results[0].reply.text` back to the original target.
5. Grand keeps the durable task and audit trail.
