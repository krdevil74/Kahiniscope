/**
 * WhatsApp and SMS — the two channels that cost money.
 *
 * The network calls themselves are not tested here; what is tested is
 * everything that would silently misbehave: the template's parameter count,
 * the number format Meta insists on, the SMS length cap, and the fact that
 * neither will try to send without credentials.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { templateParameters, toWhatsAppNumber, whatsappAdapter } from "../lib/messaging/whatsapp.js";
import { smsAdapter, smsText, SMS_MAX_LENGTH } from "../lib/messaging/sms.js";

const TO = {
  uid: "u1",
  name: "Rizu Ahmed",
  phone: "+8801712344192",
  telegramChatId: null,
  fcmTokens: [],
};

const MESSAGE = {
  short: "Voice recording · EP-41 · 4 days overdue",
  body: "Rizu, Voice recording for EP-41 রক্তমুখী নীলা is 4 days overdue.",
  taskIds: ["t1"],
  actionableTaskId: "t1",
  template: { taskType: "Voice recording", episode: "EP-41 রক্তমুখী নীলা", daysOverdue: 4 },
};

test("the template gets exactly three parameters, in order", () => {
  // Meta rejects the whole message if the count does not match the approved
  // body: Reminder: {{1}} for {{2}} is {{3}} days overdue.
  assert.deepEqual(templateParameters(MESSAGE), [
    "Voice recording",
    "EP-41 রক্তমুখী নীলা",
    "4",
  ]);
});

test("a digest still produces three parameters", () => {
  const digest = { ...MESSAGE, template: null, short: "3 open tasks · 2 overdue" };
  const params = templateParameters(digest);
  assert.equal(params.length, 3);
  assert.equal(params[0], "3 open tasks · 2 overdue");
});

test("a task that is not actually late sends 0, never a negative", () => {
  const early = { ...MESSAGE, template: { ...MESSAGE.template, daysOverdue: -3 } };
  assert.equal(templateParameters(early)[2], "0");
});

test("the number is stripped to digits, as the Graph API wants", () => {
  assert.equal(toWhatsAppNumber("+8801712344192"), "8801712344192");
  assert.equal(toWhatsAppNumber("+880 1712 344192"), "8801712344192");
});

test("WhatsApp will not try without credentials", () => {
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_ID;
  assert.equal(whatsappAdapter.canReach(TO), false);
});

test("WhatsApp needs a number as well as credentials", () => {
  process.env.WHATSAPP_TOKEN = "t";
  process.env.WHATSAPP_PHONE_ID = "p";
  assert.equal(whatsappAdapter.canReach(TO), true);
  assert.equal(whatsappAdapter.canReach({ ...TO, phone: null }), false);
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_ID;
});

test("an unconfigured send is skipped, not failed — the chain moves on", async () => {
  const outcome = await whatsappAdapter.send(TO, MESSAGE);
  assert.equal(outcome.result, "skipped");
  assert.match(outcome.error, /not configured/);
});

test("SMS is trimmed to one message, with an ellipsis rather than a cut word", () => {
  const long = { ...MESSAGE, short: "x".repeat(400) };
  const text = smsText(long);
  assert.equal(text.length, SMS_MAX_LENGTH);
  assert.match(text, /…$/);

  assert.equal(smsText(MESSAGE), MESSAGE.short, "a short one is left alone");
});

test("SMS falls back to the body when there is no short form", () => {
  assert.equal(smsText({ ...MESSAGE, short: "" }), MESSAGE.body);
});

test("SMS will not try without a key", async () => {
  delete process.env.TEXTBELT_KEY;
  assert.equal(smsAdapter.canReach(TO), false);

  const outcome = await smsAdapter.send(TO, MESSAGE);
  assert.equal(outcome.result, "skipped");
  assert.match(outcome.error, /not configured/);
});
