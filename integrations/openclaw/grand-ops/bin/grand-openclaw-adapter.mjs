#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";

export function parseAdapterArgs(argv) {
  const options = {
    grandUrl: process.env.GRAND_URL || "http://127.0.0.1:4173",
    secret: process.env.GRAND_OPENCLAW_SECRET || "",
    openclawCli: process.env.GRAND_OPENCLAW_CLI || "openclaw",
    sendReply: process.env.GRAND_OPENCLAW_SEND_REPLY === "1",
    json: false,
    event: {
      type: "channel.message",
      channel: null,
      from: null,
      peer: null,
      threadId: null,
      message: {}
    }
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--grand-url") options.grandUrl = requireValue(argv, ++index, arg);
    else if (arg === "--secret") options.secret = requireValue(argv, ++index, arg);
    else if (arg === "--openclaw-cli") options.openclawCli = requireValue(argv, ++index, arg);
    else if (arg === "--send-reply") options.sendReply = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--channel") options.event.channel = requireValue(argv, ++index, arg);
    else if (arg === "--from") options.event.from = requireValue(argv, ++index, arg);
    else if (arg === "--target" || arg === "--peer") options.event.peer = requireValue(argv, ++index, arg);
    else if (arg === "--thread-id") options.event.threadId = requireValue(argv, ++index, arg);
    else if (arg === "--message-id") options.event.message.id = requireValue(argv, ++index, arg);
    else if (arg === "--text") options.event.message.text = requireValue(argv, ++index, arg);
    else if (arg === "--timestamp") options.event.message.timestamp = requireValue(argv, ++index, arg);
    else if (arg === "--url") options.event.message.url = requireValue(argv, ++index, arg);
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export async function runOpenClawAdapter(argv, io = {}) {
  const options = parseAdapterArgs(argv);

  if (options.help) {
    const help = usage();
    io.stdout?.write(help);
    return {
      ok: true,
      help
    };
  }

  const event = options.json ? await readJsonFromStdin(io.stdin ?? process.stdin) : options.event;
  validateAdapterEvent(event);

  const response = await postGrandEvent(options.grandUrl, event, options.secret);
  const sentReplies = [];

  if (options.sendReply) {
    for (const item of response.results ?? []) {
      if (item.reply?.text) {
        sentReplies.push(await sendOpenClawReply(item.reply, options.openclawCli));
      }
    }
  }

  const output = {
    ok: true,
    response,
    sentReplies
  };

  io.stdout?.write(`${JSON.stringify(output, null, 2)}\n`);
  return output;
}

export async function postGrandEvent(grandUrl, event, secret = "") {
  const { endpoint, options } = buildGrandEventRequest(grandUrl, event, secret);

  return requestJson(endpoint, options);
}

export function buildGrandEventRequest(grandUrl, event, secret = "") {
  const endpoint = new URL("/api/openclaw/events", normalizeBaseUrl(grandUrl));
  const body = JSON.stringify(event);

  return {
    endpoint,
    options: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        ...(secret ? { authorization: `Bearer ${secret}` } : {})
      },
      body
    },
    body
  };
}

export function buildOpenClawSendArgs(reply) {
  if (!reply.target) {
    throw new Error("Cannot send OpenClaw reply without a target");
  }

  return ["message", "send", "--target", reply.target, "--message", reply.text];
}

export function sendOpenClawReply(reply, openclawCli = "openclaw") {
  const args = buildOpenClawSendArgs(reply);

  return new Promise((resolve, reject) => {
    const child = spawn(openclawCli, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = {
        command: openclawCli,
        args,
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      };

      if (code === 0) resolve(result);
      else reject(new Error(`OpenClaw reply command failed with code ${code}: ${result.stderr}`));
    });
  });
}

export function usage() {
  return `Grand OpenClaw adapter

Usage:
  grand-openclaw-adapter --channel slack --from maya --target C123 --text "Summarize today's requests."
  grand-openclaw-adapter --json < openclaw-event.json

Options:
  --grand-url <url>       Grand base URL. Default: GRAND_URL or http://127.0.0.1:4173
  --secret <secret>       Grand bridge secret. Default: GRAND_OPENCLAW_SECRET
  --send-reply            Send Grand's returned reply through the OpenClaw CLI
  --openclaw-cli <path>   OpenClaw CLI path. Default: GRAND_OPENCLAW_CLI or openclaw
  --json                  Read a full OpenClaw event JSON object from stdin
  --channel <channel>     Source channel name
  --from <sender>         Sender display name or handle
  --target <target>       Original channel target/peer for replies
  --thread-id <id>        Optional thread ID
  --message-id <id>       Optional source message ID
  --text <text>           Source message text
  --timestamp <iso>       Optional message timestamp
  --url <url>             Optional message permalink
`;
}

function validateAdapterEvent(event) {
  const text = event?.message?.text ?? event?.text;

  if (!text || typeof text !== "string") {
    throw new Error("Adapter event requires message text");
  }
}

function normalizeBaseUrl(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function requestJson(url, options) {
  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request(
      url,
      {
        method: options.method,
        headers: options.headers
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          const parsed = raw ? JSON.parse(raw) : {};

          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(parsed);
            return;
          }

          reject(new Error(`Grand returned ${response.statusCode}: ${raw}`));
        });
      }
    );

    request.on("error", reject);
    request.end(options.body);
  });
}

async function readJsonFromStdin(stdin) {
  const chunks = [];

  for await (const chunk of stdin) {
    chunks.push(Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) throw new Error("No JSON was provided on stdin");

  return JSON.parse(raw);
}

function requireValue(argv, index, flag) {
  const value = argv[index];

  if (!value) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runOpenClawAdapter(process.argv.slice(2), {
      stdin: process.stdin,
      stdout: process.stdout
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
