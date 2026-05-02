import { timingSafeEqual } from "node:crypto";
import { handleIncomingChatAsync } from "./chat-simulator.mjs";

export async function handleOpenClawEvent(state, event, options = {}) {
  const normalized = normalizeOpenClawEvent(event);
  const result = await handleIncomingChatAsync(state, normalized.incoming, {
    ...options,
    clock: normalized.receivedAt ?? options.clock
  });

  return {
    kind: result.kind,
    result,
    openclaw: normalized.openclaw,
    reply: buildOpenClawReply(normalized.openclaw, result.reply)
  };
}

export function normalizeOpenClawEvent(event) {
  if (!event || typeof event !== "object") {
    throw new Error("OpenClaw event must be an object");
  }

  const envelope = objectValue(event.event) ?? objectValue(event.payload) ?? event;
  const message = objectValue(envelope.message) ?? objectValue(event.message) ?? envelope;
  const sender =
    objectValue(envelope.from) ??
    objectValue(envelope.sender) ??
    objectValue(message.from) ??
    objectValue(message.sender) ??
    objectValue(envelope.user) ??
    objectValue(event.user);
  const channelRef =
    envelope.channel ??
    event.channel ??
    envelope.channelName ??
    envelope.channelId ??
    message.channel ??
    message.channelId ??
    "openclaw";
  const replyRef = objectValue(envelope.reply) ?? objectValue(event.reply) ?? {};
  const text = firstString(
    envelope.text,
    message.text,
    message.body,
    message.content,
    message.content?.text,
    event.text
  );

  if (!text) {
    throw new Error("OpenClaw event is missing message text");
  }

  const timestamp = firstString(
    envelope.receivedAt,
    envelope.timestamp,
    message.receivedAt,
    message.timestamp,
    message.createdAt,
    event.receivedAt,
    event.timestamp
  );
  const receivedAt = timestamp ? parseTimestamp(timestamp) : null;

  const openclaw = {
    type: firstString(event.type, envelope.type) || "channel.message",
    channel: channelName(channelRef),
    account: firstString(envelope.account, event.account, envelope.accountId, event.accountId),
    target: firstString(
      replyRef.target,
      replyRef.peer,
      replyRef.channelId,
      envelope.target,
      envelope.peer,
      envelope.peerId,
      envelope.chatId,
      message.peer,
      message.peerId,
      message.chatId,
      channelId(channelRef)
    ),
    threadId: firstString(replyRef.threadId, envelope.threadId, message.threadId),
    messageId: firstString(message.id, message.messageId, envelope.messageId, event.messageId)
  };

  return {
    incoming: {
      channel: openclaw.channel,
      from: senderName(sender, envelope.from ?? envelope.sender ?? message.from ?? event.from),
      text,
      url: firstString(message.url, message.permalink, envelope.url, event.url)
    },
    openclaw,
    receivedAt
  };
}

export function buildOpenClawReply(openclaw, text) {
  return {
    type: "channel.reply",
    channel: openclaw.channel,
    target: openclaw.target,
    threadId: openclaw.threadId,
    inReplyTo: openclaw.messageId,
    text
  };
}

export function verifyOpenClawSecret(headers, expectedSecret) {
  if (!expectedSecret) {
    return {
      ok: true,
      mode: "dev_open",
      warning: "GRAND_OPENCLAW_SECRET is not set"
    };
  }

  const providedSecret =
    bearerToken(headers) ||
    headerValue(headers, "x-grand-secret") ||
    headerValue(headers, "x-openclaw-secret");

  if (!providedSecret) {
    return {
      ok: false,
      reason: "missing_secret"
    };
  }

  if (!safeEqual(providedSecret, expectedSecret)) {
    return {
      ok: false,
      reason: "invalid_secret"
    };
  }

  return {
    ok: true,
    mode: "shared_secret"
  };
}

function senderName(sender, fallback) {
  if (typeof fallback === "string" && fallback.trim()) return fallback.trim();
  if (!sender) return "openclaw-user";

  return (
    firstString(sender.displayName, sender.name, sender.handle, sender.username, sender.email, sender.id) ||
    "openclaw-user"
  );
}

function channelName(channel) {
  if (typeof channel === "string" && channel.trim()) return channel.trim();
  if (!channel || typeof channel !== "object") return "openclaw";

  return firstString(channel.type, channel.name, channel.slug, channel.id) || "openclaw";
}

function channelId(channel) {
  if (!channel || typeof channel !== "object") return null;
  return firstString(channel.id, channel.channelId, channel.name);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function parseTimestamp(value) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid OpenClaw timestamp: ${value}`);
  }

  return parsed;
}

function bearerToken(headers) {
  const authorization = headerValue(headers, "authorization");
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function headerValue(headers, name) {
  if (!headers) return null;

  if (typeof headers.get === "function") {
    return headers.get(name);
  }

  const lowerName = name.toLowerCase();
  const value = headers[lowerName] ?? headers[name];

  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string") return value;

  return null;
}

function safeEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
