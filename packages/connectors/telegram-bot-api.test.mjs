import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGrandEventFromTelegramUpdate,
  isAllowedTelegramUpdate,
  normalizeTelegramAllowFrom
} from "./telegram-bot-api.mjs";

const update = {
  update_id: 100,
  message: {
    message_id: 4,
    date: 1777753732,
    text: "grand status",
    from: {
      id: 5034393133,
      first_name: "Evy"
    },
    chat: {
      id: 5034393133,
      type: "private"
    }
  }
};

test("normalizes Telegram allowlists", () => {
  assert.deepEqual(normalizeTelegramAllowFrom("5034393133, 42"), ["5034393133", "42"]);
  assert.deepEqual(normalizeTelegramAllowFrom(["5034393133", 42]), ["5034393133", "42"]);
});

test("checks Telegram sender allowlists", () => {
  assert.equal(isAllowedTelegramUpdate(update, ["5034393133"]), true);
  assert.equal(isAllowedTelegramUpdate(update, ["42"]), false);
  assert.equal(isAllowedTelegramUpdate(update, []), false);
  assert.equal(isAllowedTelegramUpdate(update, ["*"]), true);
});

test("builds Grand events from Telegram updates", () => {
  const event = buildGrandEventFromTelegramUpdate(update);

  assert.equal(event.channel, "telegram");
  assert.equal(event.from, "Evy");
  assert.equal(event.peer, "5034393133");
  assert.equal(event.message.id, "4");
  assert.equal(event.message.text, "grand status");
  assert.equal(event.message.timestamp, "2026-05-02T20:28:52.000Z");
});
