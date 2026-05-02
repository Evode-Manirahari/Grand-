# Grand Ops Agent Guide

## gstack

gstack is installed for Codex on this machine and should be used as the quality
workflow for substantial Grand Ops work.

Use these gstack skills when they match the task:

- `gstack-office-hours` before broad product direction or customer-wedge work.
- `gstack-autoplan` before larger feature implementation.
- `gstack-plan-ceo-review` for product scope and positioning pressure tests.
- `gstack-plan-eng-review` for architecture, data flow, edge cases, and tests.
- `gstack-plan-design-review` before meaningful UI changes.
- `gstack-review` before merging non-trivial code changes.
- `gstack-qa` or `gstack-qa-only` when a browser-checkable app flow changes.
- `gstack-cso` before adding real credentials, external writes, sandbox changes,
  billing, customer data access, or integrations.
- `gstack-ship` before opening or merging release-ready work.

Keep the repo's own constraints first: small, dependency-light MVP slices;
auditable task state; explicit approval before external mutations; and clear
mapping back to OpenClaw, NemoClaw, and ClawSweeper.
