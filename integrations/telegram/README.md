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
