export function normalizeTelegramAllowFrom(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (typeof value !== "string") return [];

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isAllowedTelegramUpdate(update, allowFrom = []) {
  const senderId = telegramSenderId(update);
  if (!senderId) return false;
  if (allowFrom.length === 0) return false;
  return allowFrom.includes("*") || allowFrom.includes(senderId);
}

export function buildGrandEventFromTelegramUpdate(update) {
  const message = update?.message;
  const text = telegramMessageText(update);

  if (!message || !text) {
    throw new Error("Telegram update does not contain a text message");
  }

  const chatId = telegramChatId(update);
  const senderId = telegramSenderId(update);
  const senderName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ").trim();

  return {
    type: "channel.message",
    channel: "telegram",
    from: senderName || message.from?.username || senderId || "telegram-user",
    peer: chatId,
    message: {
      id: String(message.message_id),
      text,
      timestamp: message.date ? new Date(message.date * 1000).toISOString() : undefined
    }
  };
}

export function telegramMessageText(update) {
  const text = update?.message?.text;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

export function telegramChatId(update) {
  const id = update?.message?.chat?.id;
  if (typeof id === "number" || typeof id === "string") return String(id);
  return null;
}

export function telegramSenderId(update) {
  const id = update?.message?.from?.id;
  if (typeof id === "number" || typeof id === "string") return String(id);
  return null;
}
