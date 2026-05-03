# Grand Ops

Grand Ops is a chat-native AI operations assistant for small teams. It turns
messy business messages into tracked work, routes risky actions through human
approval, and keeps durable reports for every task.

The product direction combines three ideas:

- OpenClaw-style multi-channel assistant access.
- NemoClaw-style sandbox and policy controls around agent execution.
- ClawSweeper-style durable records, guarded apply, and command-driven status.

## Run Locally

Requires Node.js 22 or newer.

```bash
npm run dev
```

Open http://localhost:4173.

For the OpenClaw bridge, copy `.env.example` to `.env` and set
`GRAND_OPENCLAW_SECRET` to a long random value before running the server. The
local server auto-loads `.env`, while committed source keeps secrets out of git.

Run tests:

```bash
npm test
```

No package install is required for the MVP because it uses Node built-ins only.

## AI Workflow

gstack is the quality workflow for this repo. Use the project guidance in
`AGENTS.md` for product review, architecture review, design review, QA, security
checks, and release work.

## OpenClaw Bridge

See `docs/openclaw-bridge.md` for the authenticated event endpoint, payload
shape, response format, and manual test command.

The OpenClaw skill and adapter live in `integrations/openclaw/grand-ops`.
Install instructions are in `integrations/openclaw/README.md`.

## Telegram Bridge

Telegram is the first live channel. `npm run telegram:bridge` polls a BotFather
bot, allowlists trusted Telegram sender IDs, forwards messages into Grand, and
sends Grand's status or approval reply back to the same chat. Setup details live
in `integrations/telegram/README.md`.

Useful Telegram commands:

```text
grand status
grand report
grand next
grand github status
grand github sync
grand github issue <title>
grand github drafts
grand github publish <task-id>
grand list
grand list approvals
grand task <task-id>
grand approve <task-id>
grand reject <task-id>
grand run
grand done <task-id>
```

## MVP

- Chat simulator for Slack, Telegram, Discord, WhatsApp, and WebChat inputs.
- Authenticated OpenClaw event bridge at `POST /api/openclaw/events`.
- Direct Telegram bot bridge for a working first production-style channel.
- Telegram command surface for listing, approving, rejecting, and running work.
- GitHub Issues sync that imports open issues as deduped Grand tasks.
- GitHub issue creation from Telegram when `GITHUB_TOKEN` or `GH_TOKEN` is configured.
- Local GitHub issue drafts, listing, and later publish flow when creation auth
  is not configured yet.
- Task engine that extracts work from inbound messages.
- Approval states for risky actions such as refunds, payments, sends, deletes,
  purchases, exports, and external changes.
- Simulated sandbox runner that completes approved safe work and blocks unsafe
  work.
- Dashboard with queue, approvals, completed work, metrics, and audit events.
- Markdown task reports suitable for later GitHub/state-repo publishing.

## Product Wedge

Start with small businesses and agencies that already run operations in chat.
Grand Ops should be useful before deep integrations: capture requests, organize
them, ask for approval when needed, and create a reliable trail of what happened.

## Structure

```text
apps/web/              local web dashboard and HTTP API
packages/core/         task engine and workflow rules
packages/connectors/   channel command handling and message intake
packages/reports/      durable JSON state and markdown task reports
packages/sandbox/      policy evaluation and simulated safe runner
docs/                  product, architecture, and integration plan
data/                  local runtime state
```

## Next Build Steps

1. Replace the simulated runner with NemoClaw/OpenShell-managed execution.
2. Publish task reports to a separate state repository.
3. Add real integrations for Gmail, Linear/GitHub Issues, Stripe, HubSpot, and
   Google Calendar.
4. Add organization accounts, roles, approval policies, and billing.
