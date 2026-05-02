# Architecture

## Runtime Shape

Grand Ops has four layers:

1. Channel intake receives messages from chat surfaces.
2. Task engine normalizes work, risk, status, and approvals.
3. Sandbox runner executes safe or approved work under policy.
4. Report store keeps durable state and audit reports.

```text
Chat channels -> Connector -> Task Engine -> Policy -> Runner -> Reports
                         |                         |
                         +------ Dashboard/API ----+
```

## OpenClaw Mapping

OpenClaw is the right reference for channel delivery, session routing, skills,
and always-on assistant behavior. Grand should treat OpenClaw as the channel and
assistant gateway instead of inventing every messaging adapter.

Initial integration point:

- receive inbound channel events
- route them into `handleIncomingChat`
- reply with task status or approval prompts
- use OpenClaw skills for business-specific actions

## NemoClaw Mapping

NemoClaw is the right reference for safer autonomous execution. Grand should
not run arbitrary work directly on the host. Risky tasks should move through a
policy check and into an isolated execution environment.

Initial integration point:

- send approved work to an OpenShell/NemoClaw-managed sandbox
- restrict network egress by integration
- keep host credentials out of agent prompts
- require explicit human approval for external mutations

## ClawSweeper Mapping

ClawSweeper is the right reference for durable automation. Grand should avoid
posting noisy duplicate messages or hiding decisions in ephemeral logs.

Initial integration point:

- one durable report per task
- one durable status per task thread
- snapshot hash before apply
- guarded apply before external mutation
- audit trail for every decision

## Data Model

The MVP stores one JSON state file. Production should move this into Postgres or
SQLite with append-only event storage.

Primary entities:

- task
- event
- approval
- connector message
- sandbox run
- report

## Safety Defaults

- Unknown inbound users can create draft tasks but cannot authorize actions.
- Risky actions require approval.
- Blocked actions stay blocked until an admin changes policy.
- External writes must create an audit event before and after execution.
- Secrets should be mounted into sandbox jobs, never sent as chat text.
