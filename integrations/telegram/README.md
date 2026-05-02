# Telegram Bridge

This bridge gives Grand Ops a direct Telegram bot loop for command and task
capture without requiring an OpenClaw model key. It uses the same Grand event
endpoint as the OpenClaw adapter.

## Configure

```bash
GRAND_TELEGRAM_BOT_TOKEN_FILE=/Users/evodemanirahari/.openclaw/secrets/telegram-bot-token
GRAND_TELEGRAM_ALLOW_FROM=5034393133
```

The bridge denies all senders unless `GRAND_TELEGRAM_ALLOW_FROM` is set. Use a
comma-separated list of numeric Telegram user IDs, or `*` only for a deliberately
public bot.

Keep the token file outside git and locked to the local user:

```bash
chmod 600 ~/.openclaw/secrets/telegram-bot-token
```

## Run

```bash
npm run telegram:bridge
```

For a one-shot poll during setup:

```bash
npm run telegram:bridge -- --once
```

Use `--drop-pending` once if you want the bridge to ignore old Telegram updates
and start from the next new message.

## Commands

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

Normal messages become Grand tasks. Risky tasks, such as refunds or customer
messages, reply with the task ID plus approve/reject commands.

`grand github sync` imports open GitHub issues from `GRAND_GITHUB_REPO` as
Grand tasks. You can override the repo inline:

```text
grand github sync owner/repo
```

`grand github issue <title>` creates a GitHub issue in `GRAND_GITHUB_REPO` and
tracks it as a Grand task. Issue creation requires `GITHUB_TOKEN` or `GH_TOKEN`
in Grand's local environment.

## Background Services

On this Mac, Grand is managed by launchd with two user LaunchAgents:

```text
com.grandops.web
com.grandops.telegram-bridge
```

Useful local operations:

```bash
launchctl print gui/501/com.grandops.web
launchctl print gui/501/com.grandops.telegram-bridge
launchctl kickstart -k gui/501/com.grandops.web
launchctl kickstart -k gui/501/com.grandops.telegram-bridge
```

Logs live in:

```text
~/.openclaw/logs/grand-web.log
~/.openclaw/logs/grand-web.err.log
~/.openclaw/logs/grand-telegram-bridge.log
~/.openclaw/logs/grand-telegram-bridge.err.log
```
