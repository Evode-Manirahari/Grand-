#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnvFile } from "../../packages/config/env-file.mjs";
import {
  buildGrandEventFromTelegramUpdate,
  isAllowedTelegramUpdate,
  normalizeTelegramAllowFrom,
  telegramChatId,
  telegramMessageText
} from "../../packages/connectors/telegram-bot-api.mjs";
import { postGrandEvent } from "../openclaw/grand-ops/bin/grand-openclaw-adapter.mjs";

loadEnvFile();
loadEnvFile(path.join(os.homedir(), ".openclaw", ".env"));

export function parseBridgeArgs(argv) {
  const options = {
    grandUrl: process.env.GRAND_URL || "http://127.0.0.1:4173",
    secret: process.env.GRAND_OPENCLAW_SECRET || "",
    token: process.env.GRAND_TELEGRAM_BOT_TOKEN || "",
    tokenFile:
      process.env.GRAND_TELEGRAM_BOT_TOKEN_FILE ||
      path.join(os.homedir(), ".openclaw", "secrets", "telegram-bot-token"),
    allowFrom: normalizeTelegramAllowFrom(process.env.GRAND_TELEGRAM_ALLOW_FROM || ""),
    offsetFile:
      process.env.GRAND_TELEGRAM_OFFSET_FILE ||
      path.join(os.homedir(), ".openclaw", "grand-telegram-offset.json"),
    once: false,
    dropPending: false,
    pollTimeoutSeconds: 25,
    idleMs: 1000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--grand-url") options.grandUrl = requireValue(argv, ++index, arg);
    else if (arg === "--secret") options.secret = requireValue(argv, ++index, arg);
    else if (arg === "--token") options.token = requireValue(argv, ++index, arg);
    else if (arg === "--token-file") options.tokenFile = requireValue(argv, ++index, arg);
    else if (arg === "--allow-from") options.allowFrom = normalizeTelegramAllowFrom(requireValue(argv, ++index, arg));
    else if (arg === "--offset-file") options.offsetFile = requireValue(argv, ++index, arg);
    else if (arg === "--poll-timeout") options.pollTimeoutSeconds = Number(requireValue(argv, ++index, arg));
    else if (arg === "--idle-ms") options.idleMs = Number(requireValue(argv, ++index, arg));
    else if (arg === "--once") options.once = true;
    else if (arg === "--drop-pending") options.dropPending = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export async function runTelegramBridge(argv, io = {}) {
  const options = parseBridgeArgs(argv);

  if (options.help) {
    const help = usage();
    io.stdout?.write(help);
    return { ok: true, help };
  }

  const token = await resolveToken(options);
  let offset = await readOffset(options.offsetFile);

  if (options.dropPending) {
    const updates = await getTelegramUpdates(token, { offset, timeout: 0 });
    offset = nextOffset(updates, offset);
    await writeOffset(options.offsetFile, offset);
    io.stdout?.write(`Dropped pending Telegram updates. Next offset: ${offset ?? "none"}\n`);
  }

  do {
    const updates = await getTelegramUpdates(token, {
      offset,
      timeout: options.once ? 0 : options.pollTimeoutSeconds
    });

    for (const update of updates) {
      offset = update.update_id + 1;
      await writeOffset(options.offsetFile, offset);
      await handleTelegramUpdate(update, token, options, io);
    }

    if (options.once) break;
    if (updates.length === 0) await sleep(options.idleMs);
  } while (true);

  return { ok: true, offset };
}

export async function handleTelegramUpdate(update, token, options, io = {}) {
  if (!telegramMessageText(update)) return { skipped: "non_text" };

  if (!isAllowedTelegramUpdate(update, options.allowFrom)) {
    io.stderr?.write(`Blocked Telegram sender ${update.message?.from?.id ?? "unknown"}\n`);
    return { skipped: "not_allowed" };
  }

  const event = buildGrandEventFromTelegramUpdate(update);
  const response = await postGrandEvent(options.grandUrl, event, options.secret);

  for (const result of response.results ?? []) {
    if (result.reply?.text) {
      await sendTelegramMessage(token, {
        chatId: result.reply.target || telegramChatId(update),
        text: result.reply.text
      });
    }
  }

  io.stdout?.write(`Handled Telegram message ${event.message.id}\n`);
  return { ok: true, response };
}

async function resolveToken(options) {
  if (options.token) return options.token.trim();

  const token = (await readFile(options.tokenFile, "utf8")).trim();
  if (!token) throw new Error(`Telegram token file is empty: ${options.tokenFile}`);
  return token;
}

async function getTelegramUpdates(token, params) {
  const body = new URLSearchParams({
    timeout: String(params.timeout),
    allowed_updates: JSON.stringify(["message"])
  });

  if (params.offset) body.set("offset", String(params.offset));

  const data = await telegramRequest(token, "getUpdates", body);
  return Array.isArray(data.result) ? data.result : [];
}

async function sendTelegramMessage(token, params) {
  if (!params.chatId) throw new Error("Cannot send Telegram reply without chat id");

  const body = new URLSearchParams({
    chat_id: params.chatId,
    text: params.text.slice(0, 4096)
  });

  return telegramRequest(token, "sendMessage", body);
}

async function telegramRequest(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    throw new Error(`Telegram ${method} failed: ${data.description || response.statusText}`);
  }

  return data;
}

async function readOffset(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    return Number.isInteger(parsed.offset) ? parsed.offset : undefined;
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeOffset(filePath, offset) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ offset }, null, 2)}\n`, { mode: 0o600 });
}

function nextOffset(updates, fallback) {
  return updates.reduce((offset, update) => Math.max(offset ?? 0, update.update_id + 1), fallback);
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function usage() {
  return `Grand Telegram bridge

Usage:
  node integrations/telegram/grand-telegram-bridge.mjs
  node integrations/telegram/grand-telegram-bridge.mjs --once

Environment:
  GRAND_URL                         Grand base URL
  GRAND_OPENCLAW_SECRET             Shared Grand bridge secret
  GRAND_TELEGRAM_BOT_TOKEN_FILE     Telegram bot token file
  GRAND_TELEGRAM_ALLOW_FROM         Comma-separated Telegram sender IDs
`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runTelegramBridge(process.argv.slice(2), {
      stdout: process.stdout,
      stderr: process.stderr
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
