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

Run tests:

```bash
npm test
```

No package install is required for the MVP because it uses Node built-ins only.

## MVP

- Chat simulator for Slack, Telegram, Discord, WhatsApp, and WebChat inputs.
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

1. Replace the chat simulator with OpenClaw channel events.
2. Replace the simulated runner with NemoClaw/OpenShell-managed execution.
3. Publish task reports to a separate state repository.
4. Add real integrations for Gmail, Linear/GitHub Issues, Stripe, HubSpot, and
   Google Calendar.
5. Add organization accounts, roles, approval policies, and billing.
