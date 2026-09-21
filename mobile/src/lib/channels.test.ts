import test from "node:test";
import assert from "node:assert/strict";

import { bestChannelFor, channelLabel, reachableChannels } from "./channels.ts";
import { DEFAULT_SETTINGS } from "./model.ts";
import type { Settings, TeamMember } from "./model";

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    uid: "u1",
    name: "Rizu Ahmed",
    email: "rizu@gmail.com",
    phone: null,
    telegramChatId: null,
    accountless: false,
  crafts: ["Voice"],
    status: "approved",
    role: "member",
    fcmTokens: [],
    note: null,
    preferredChannel: null,
    createdAt: null,
    ...overrides,
  };
}

/** What the app ships with: only the channels that cost nothing. */
const settings: Settings = DEFAULT_SETTINGS;

/** For tests about ordering rather than about what is switched on. */
const allOn: Settings = {
  ...DEFAULT_SETTINGS,
  channels: { push: true, telegram: true, whatsapp: true, sms: true, email: true },
};

test("the app ships with only the free channels on", () => {
  assert.equal(DEFAULT_SETTINGS.channels.push, true, "free and unlimited");
  assert.equal(DEFAULT_SETTINGS.channels.telegram, true, "free and unlimited");
  assert.equal(DEFAULT_SETTINGS.channels.whatsapp, false, "bills per message");
  assert.equal(DEFAULT_SETTINGS.channels.sms, false, "one message a day on the free key");
});

test("push wins when the app is installed", () => {
  const m = member({ fcmTokens: ["token"], telegramChatId: "123", phone: "+8801712344192" });
  assert.equal(bestChannelFor(m, settings), "push");
});

test("without the app, Telegram is the workhorse", () => {
  const m = member({ telegramChatId: "123", phone: "+8801712344192" });
  assert.equal(bestChannelFor(m, settings), "telegram");
});

test("with only a number, nothing reaches them until a paid channel is switched on", () => {
  const m = member({ phone: "+8801712344192" });
  // The shipped default: a phone number alone is not reachable for free.
  assert.equal(bestChannelFor(m, settings), null);

  assert.equal(bestChannelFor(m, allOn), "whatsapp");

  const smsOnly: Settings = {
    ...settings,
    channels: { ...settings.channels, whatsapp: false, sms: true },
  };
  assert.equal(bestChannelFor(m, smsOnly), "sms");
});

test("a channel switched off is skipped even when it would work", () => {
  const m = member({ fcmTokens: ["token"], telegramChatId: "123" });
  const noPush: Settings = { ...settings, channels: { ...settings.channels, push: false } };
  assert.equal(bestChannelFor(m, noPush), "telegram");
});

test("nothing connected is reported, not hidden", () => {
  assert.equal(bestChannelFor(member(), settings), null);
  assert.equal(channelLabel(null), "no channel");
});

test("a task's preferred channel wins, if it would actually reach them", () => {
  const m = member({ fcmTokens: ["token"], telegramChatId: "123", phone: "+8801712344192" });
  assert.equal(bestChannelFor(m, allOn, "whatsapp"), "whatsapp");
  assert.equal(
    bestChannelFor(m, settings, "whatsapp"),
    "push",
    "a preference for a channel that is switched off is not a dead end"
  );
  // Preferred but not connected: fall back down the chain.
  assert.equal(bestChannelFor(member({ fcmTokens: ["t"] }), settings, "telegram"), "push");
});

test("the fallback chain keeps its order", () => {
  const m = member({ fcmTokens: ["t"], telegramChatId: "123", phone: "+8801712344192" });
  assert.deepEqual(reachableChannels(m, allOn), ["push", "telegram", "whatsapp", "sms"]);
  assert.deepEqual(reachableChannels(m, settings), ["push", "telegram"], "free channels only");
});

test("the admin's choice for a person is honoured, and still falls through", () => {
  const m = member({
    fcmTokens: ["token"],
    telegramChatId: "123",
    phone: "+8801712344192",
    preferredChannel: "telegram",
  });
  assert.equal(bestChannelFor(m, settings), "telegram", "not push, because the admin said so");

  // A task-level choice beats the person-level one.
  assert.equal(bestChannelFor(m, allOn, "whatsapp"), "whatsapp");

  // And a pinned channel that cannot reach them is not a dead end.
  const noTelegram = member({ fcmTokens: ["token"], preferredChannel: "telegram" });
  assert.equal(bestChannelFor(noTelegram, settings), "push");

  // Nor is one that has been switched off.
  const offSettings = { ...settings, channels: { ...settings.channels, telegram: false } };
  assert.equal(bestChannelFor(m, offSettings), "push");
});
