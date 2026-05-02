# Integration Plan

## Phase 1: Local Proof

- Keep the dependency-free dashboard running.
- Prove the task lifecycle: intake, approval, execution, report.
- Test with real user messages copied from daily workflows.

## Phase 2: OpenClaw Channel Bridge

- Create an OpenClaw skill or gateway adapter that forwards inbound messages to
  Grand's `/api/openclaw/events` endpoint.
- Route Grand responses back to the original channel.
- Map channel users to Grand users and teams.

## Phase 3: Sandboxed Work

- Replace `runQueuedTasks` simulation with a sandbox execution client.
- Start with read-only tools.
- Add write tools only behind approval policies.
- Store sandbox run logs as report attachments.

## Phase 4: Durable State Repo

- Publish task reports into a generated state repository.
- Add a dashboard build that reads reports and renders operational status.
- Keep one canonical record per task.

## Phase 5: Real Integrations

High-value first integrations:

- Gmail or Google Workspace for summaries and draft replies.
- Google Calendar for scheduling.
- GitHub Issues or Linear for work tracking.
- Stripe for refund draft and payment status checks.
- HubSpot or a simple CSV contact source for customer context.

The first write integrations should create drafts, not send final actions.
